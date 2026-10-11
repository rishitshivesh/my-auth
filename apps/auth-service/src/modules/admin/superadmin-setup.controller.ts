import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  Res,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { type Response } from "express";
import { AdminService } from "./admin.service";
import { CreateFirstAdminDto } from "./dto/create-first-admin.dto";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { setAuthCookies } from "@/common/http/auth-cookies";

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
   * Returns the platform's identity and initialization state.
   * Used by the admin portal middleware to obtain the tenant slug and
   * determine whether to show /setup or redirect to login.
   */
  @Public()
  @Get("platform-info")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get platform identity and initialization state",
    description: "Returns slug, name, and initialized flag. Safe to call unauthenticated.",
  })
  @ApiResponse({ status: 200, description: "Platform info" })
  async getPlatformInfo(): Promise<{ slug: string; name: string; initialized: boolean }> {
    return this.adminService.getPlatformInfo();
  }

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
   * Returns the filesystem path where the setup token was written, so operators
   * can retrieve it without grepping Docker logs.
   */
  @Public()
  @Get("setup-log-hint")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 3, windowMs: 60000, keyBy: "ip" })
  @ApiOperation({ summary: "Get the setup log file path" })
  @ApiResponse({ status: 200, description: "File path hint" })
  getSetupLogHint(): { path: string | null; hint: string } {
    const filePath = this.adminService.getSetupLogPath();
    return {
      path: filePath,
      hint: filePath
        ? `cat "${filePath}"`
        : "Check SENTRY_SETUP_LOG_DIR env var or run: docker logs auth-service | grep 'SETUP TOKEN'",
    };
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
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
    @Headers("x-setup-token") setupToken: string,
  ) {
    const result = await this.adminService.createFirstAdmin(
      body,
      setupToken ?? "",
      ip ?? "0.0.0.0",
      userAgent ?? "unknown",
    );

    // Tokens go into httpOnly cookies — never in the response body
    setAuthCookies(res, result.accessToken, result.refreshToken);

    return { user: result.user };
  }
}
