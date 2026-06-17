import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import type { CreateFirstAdminDto } from "./admin.service";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { Public } from "@/common/decorators/public.decorator";

/**
 * Public endpoints for first-run platform initialization.
 *
 * These routes intentionally have NO authentication guards so the system can
 * bootstrap itself before any superadmin exists.  The TenantSchemaMiddleware
 * is also excluded from all `superadmin/*` paths (see GlobalModule).
 */
@ApiTags("Superadmin - Setup")
@Controller("superadmin")
export class SuperadminSetupController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Check whether the platform has at least one superadmin account.
   * Safe to call unauthenticated — returns no sensitive data.
   */
  @Public()
  @Get("initialized")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Check if the platform has been initialized",
    description:
      "Returns { initialized: true } when at least one sentry-internal user exists.",
  })
  @ApiResponse({ status: 200, description: "Initialization status" })
  async checkInitialized(): Promise<{ initialized: boolean }> {
    const initialized = await this.adminService.isInitialized();
    return { initialized };
  }

  /**
   * Create the very first superadmin account.
   * Returns 409 Conflict if the platform is already initialized.
   */
  @Public()
  @Post("create-first-admin")
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ max: 5, windowMs: 60000, keyBy: "ip" })
  @ApiOperation({
    summary: "Create the first superadmin account",
    description:
      "One-shot endpoint for first-run setup. Returns 409 if already initialized.",
  })
  @ApiResponse({ status: 201, description: "Superadmin created, access token returned" })
  @ApiResponse({ status: 409, description: "Platform already initialized" })
  async createFirstAdmin(
    @Body() body: CreateFirstAdminDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
    @Headers("x-setup-token") setupToken: string,
  ) {
    return this.adminService.createFirstAdmin(
      body,
      setupToken ?? "",
      ip ?? "0.0.0.0",
      userAgent ?? "unknown",
    );
  }
}
