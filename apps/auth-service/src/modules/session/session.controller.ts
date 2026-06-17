import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Protected } from "../../common/decorators/protected.decorator";
import { SessionManagementService } from "./session-management.service";

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean; sessionId?: string };
  ip?: string;
  route?: { path: string };
  params?: Record<string, string>;
}

@ApiTags("Sessions")
@Controller("sessions")
export class SessionController {
  constructor(
    private readonly sessionManagementService: SessionManagementService,
  ) {}

  /**
   * Get all active sessions for current user
   */
  @Get("active")
  @Protected()
  @ApiOperation({
    summary: "Get active sessions",
    description: "List all active sessions/devices for the current user",
  })
  @ApiResponse({
    status: 200,
    description: "List of active sessions",
  })
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;
    const currentSessionId = req.user.sessionId ?? '';

    return this.sessionManagementService.getActiveSessions(
      userId,
      tenantId,
      currentSessionId,
    );
  }

  /**
   * Get session analytics
   */
  @Get("analytics")
  @Protected()
  @ApiOperation({ summary: "Get session analytics" })
  async getSessionAnalytics(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;

    return this.sessionManagementService.getSessionAnalytics(userId, tenantId);
  }

  /**
   * Revoke a specific session
   */
  @Delete(":sessionId")
  @Protected()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Revoke a session",
    description: "Logout from a specific device/session",
  })
  async revokeSession(@Param("sessionId") sessionId: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;

    await this.sessionManagementService.revokeSession(
      sessionId,
      userId,
      tenantId,
      "user_revoked_via_api",
    );

    return { message: "Session revoked successfully" };
  }

  /**
   * Revoke all other sessions (logout all devices except current)
   */
  @Delete("all/other")
  @Protected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logout all other devices",
    description: "Revoke all sessions except the current one",
  })
  async revokeAllOtherSessions(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;
    const currentSessionId = req.user.sessionId ?? '';

    const revokedCount =
      await this.sessionManagementService.revokeAllOtherSessions(
        userId,
        tenantId,
        currentSessionId,
      );

    return {
      message: "All other sessions revoked",
      revokedCount,
    };
  }

  /**
   * Revoke all sessions (logout all devices including current)
   */
  @Delete("all")
  @Protected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logout all devices",
    description: "Revoke all sessions including the current one",
  })
  async revokeAllSessions(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;

    const revokedCount =
      await this.sessionManagementService.revokeAllUserSessions(
        userId,
        tenantId,
        "user_logout_all_via_api",
      );

    return {
      message: "All sessions revoked",
      revokedCount,
    };
  }
}
