import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import {
  TenantRegistrationService,
  RegisterTenantDto,
  type TenantRegistrationResult,
} from "./tenant-registration.service";
import { Public } from "@/common/decorators/public.decorator";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import type { Response } from "express";
import { ACCESS_TOKEN_TTL_SECONDS, setAuthCookies } from "@/common/http/auth-cookies";
import { RedisService } from "@/common/service/redis.service";

@ApiTags("Tenant Registration")
@Controller()
export class TenantRegistrationController {
  constructor(
    private readonly tenantRegistrationService: TenantRegistrationService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Real-time slug availability check for the onboarding wizard.
   * Public — no auth required.
   */
  @Public()
  @Get("tenants/slug-check")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60000, keyBy: "ip" })
  @ApiOperation({ summary: "Check workspace slug availability" })
  @ApiResponse({ status: 200, description: "Availability status" })
  async checkSlug(
    @Query("slug") slug: string,
  ): Promise<{ available: boolean; reason?: string }> {
    if (!slug || typeof slug !== "string") {
      return { available: false, reason: "Slug is required" };
    }
    return this.tenantRegistrationService.checkSlugAvailability(
      slug.toLowerCase().trim(),
    );
  }

  /**
   * Self-service tenant registration.
   * Creates a workspace, bootstraps default roles, and returns a JWT for the new owner.
   */
  @Public()
  @Post("tenants/register")
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ max: 3, windowMs: 3600000, keyBy: "ip" })
  @ApiOperation({ summary: "Create a new workspace (self-service)" })
  @ApiResponse({ status: 201, description: "Workspace created, tokens returned" })
  @ApiResponse({ status: 409, description: "Slug already taken" })
  @ApiResponse({ status: 400, description: "Validation error" })
  async registerTenant(
    @Body() dto: RegisterTenantDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<PublicTenantRegistration> {
    // Idempotency: a repeated key within 10 minutes returns the same public result. Only the
    // non-secret part is cached; credentials are never stored, so a replay sets no cookies.
    const idempotencyKey = `tenant-reg:idem:${dto.slug}:${dto.idempotencyKey}`;
    const cached = await this.redisService.get<PublicTenantRegistration>('', '', idempotencyKey).catch(() => null);
    if (cached) {
      return cached;
    }

    const { accessToken, refreshToken, ...publicPart } = await this.tenantRegistrationService.registerTenant(
      dto,
      ip ?? "0.0.0.0",
      userAgent ?? "unknown",
    );
    // ADR-0003: tokens travel only as httpOnly cookies, never in the body.
    if (res) setAuthCookies(res, accessToken, refreshToken);
    const result: PublicTenantRegistration = { ...publicPart, expiresIn: ACCESS_TOKEN_TTL_SECONDS };

    await this.redisService.set('', '', idempotencyKey, result, 600).catch(() => {});

    return result;
  }
}

/** Registration response: no credentials (they are set as cookies). */
export type PublicTenantRegistration = Omit<TenantRegistrationResult, "accessToken" | "refreshToken"> & { expiresIn: number };
