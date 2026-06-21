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
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import {
  TenantRegistrationService,
  RegisterTenantDto,
} from "./tenant-registration.service";
import { Public } from "@/common/decorators/public.decorator";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";

@ApiTags("Tenant Registration")
@Controller()
export class TenantRegistrationController {
  constructor(
    private readonly tenantRegistrationService: TenantRegistrationService,
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
    @Body() body: RegisterTenantDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.tenantRegistrationService.registerTenant(
      body,
      ip ?? "0.0.0.0",
      userAgent ?? "unknown",
    );
  }
}
