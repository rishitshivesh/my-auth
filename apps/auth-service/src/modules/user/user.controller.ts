// apps/auth-service/src/modules/user/user.controller.ts
// UPDATED WITH RBAC PROTECTION

import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
  Header,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { PermissionsGuard } from "../rbac/guards/permissions.guard";
import { UserService, ListUsersOptions } from "./user.service";
import { OrgMembership } from "./user.repository";
import { SessionManagementService } from "@/modules/session/session-management.service";
import {
  UpdateUserDto,
  ChangePasswordDto,
  UserStatsDto,
  ListUsersQueryDto,
  BulkUpdateUsersDto,
  ListUsersResponseDto,
  InviteUserDto,
} from "./user.dto";
import { JwtAuthGuard, RequireRecentAuth } from "@/common/guards";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Protected } from "@/common/decorators/protected.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";

const DEFAULT_EVENT_LIMIT = 50;
const MIN_EVENT_LIMIT = 1;
const MAX_EVENT_LIMIT = 100;

/** Parse a ?limit= value; non-numeric falls back to the default, others are clamped to 1..100. */
function clampLimit(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_EVENT_LIMIT;
  return Math.min(MAX_EVENT_LIMIT, Math.max(MIN_EVENT_LIMIT, parsed));
}

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean; sessionId?: string };
  requestId?: string;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  route?: { path: string };
  params?: Record<string, string>;
}

@ApiTags("Users")
@Controller("users")
@Protected()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly sessionManagementService: SessionManagementService,
  ) {}

  // ============================================================
  // CURRENT USER ENDPOINTS (Own Profile)
  // ============================================================

  /**
   * Get current user profile
   * Anyone authenticated can read their own profile
   */
  @Get("me")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "User profile retrieved" })
  async getProfile(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId!;
    return this.userService.findById(tenantId, req.user.sub);
  }

  /**
   * Update current user profile
   * Anyone authenticated can update their own profile
   */
  @Put("me")
  @ApiOperation({ summary: "Update current user profile" })
  @ApiResponse({ status: 200, description: "Profile updated successfully" })
  @ApiResponse({ status: 400, description: "Bad request - validation failed" })
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const tenantId = req.tenantId!;
    await this.userService.update(tenantId, req.user.sub, updateUserDto);
    return { message: "Profile updated successfully" };
  }

  /**
   * Change own password
   * Anyone authenticated can change their own password
   */
  @Post("me/change-password")
  @RequireRecentAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change user password" })
  @ApiResponse({ status: 200, description: "Password changed successfully" })
  @ApiResponse({
    status: 400,
    description: "Invalid current password or weak new password",
  })
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const tenantId = req.tenantId!;
    await this.userService.changePassword(
      tenantId,
      req.user.sub,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
      {
        ip: req.ip ?? "0.0.0.0",
        userAgent: String(req.headers?.["user-agent"] ?? "unknown"),
        requestId: req.requestId,
        sessionId: req.user.sessionId,
      },
    );
    return { message: "Password changed successfully" };
  }

  /**
   * Get active sessions for current user
   * Anyone authenticated can view their own sessions
   */
  @Get("me/sessions")
  @ApiOperation({ summary: "Get all active sessions" })
  @ApiResponse({ status: 200, description: "Sessions retrieved" })
  async getSessions(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId!;
    return this.userService.getActiveSessions(tenantId, req.user.sub);
  }

  /**
   * Revoke a specific session
   * Anyone authenticated can revoke their own sessions
   */
  @Delete("me/sessions/:sessionId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke a specific session" })
  @ApiResponse({ status: 200, description: "Session revoked" })
  @ApiResponse({ status: 404, description: "Session not found" })
  async revokeSession(
    @Request() req: AuthenticatedRequest,
    @Param("sessionId") sessionId: string,
  ) {
    const tenantId = req.tenantId!;
    await this.userService.revokeSession(tenantId, req.user.sub, sessionId);
    return { message: "Session revoked successfully" };
  }

  /**
   * Revoke all sessions except current
   * Anyone authenticated can revoke all their sessions
   */
  @Delete("me/sessions")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke all sessions except current" })
  @ApiResponse({ status: 200, description: "Sessions revoked" })
  async revokeAllSessions(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId!;
    await this.userService.revokeAllSessions(
      tenantId,
      req.user.sub,
      req.user.sessionId,
    );
    return { message: "All other sessions revoked successfully" };
  }

  /**
   * Get security events for current user
   * Anyone authenticated can view their own security events
   */
  @Get("me/security-events")
  @ApiOperation({ summary: "Get security event history" })
  @ApiResponse({ status: 200, description: "Security events retrieved" })
  async getSecurityEvents(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit: string = "50",
  ) {
    const tenantId = req.tenantId!;
    return this.userService.getSecurityEvents(
      tenantId,
      req.user.sub,
      clampLimit(limit),
    );
  }

  /**
   * Get all organizations the current user is a member of (including guest memberships)
   * Used to power the org-switcher in the portal header
   */
  @Get("orgs")
  @ApiOperation({ summary: "Get user organization memberships" })
  @ApiResponse({ status: 200, description: "Organization memberships retrieved" })
  async getUserOrgs(@Request() req: AuthenticatedRequest): Promise<OrgMembership[]> {
    return this.userService.getUserOrgs(req.user.sub, req.tenantId!);
  }

  /**
   * Delete own account (soft delete)
   * Anyone authenticated can delete their own account
   */
  @Delete("me")
  @RequireRecentAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete user account" })
  @ApiResponse({ status: 200, description: "Account deleted successfully" })
  async deleteAccount(@Request() req: AuthenticatedRequest, @Body("password") password: string) {
    const tenantId = req.tenantId!;
    await this.userService.deleteAccount(
      tenantId,
      req.user.sub,
      password,
      req.requestId,
    );
    return { message: "Account deleted successfully" };
  }

  // ============================================================
  // ADMIN ENDPOINTS (Manage Other Users)
  // ============================================================

  /**
   * List all users (Admin only)
   * Requires: users:read permission
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "List all users (Admin)" })
  @ApiResponse({ status: 200, description: "Users retrieved" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async listUsers(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListUsersQueryDto,
  ): Promise<ListUsersResponseDto> {
    const tenantId = req.tenantId!;

    const options: ListUsersOptions = {
      ...query,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
    };
    return this.userService.listUsers(tenantId, options);
  }

  /**
   * Get user statistics (Admin)
   */
  @Get("stats")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({
    summary: "Get user statistics (Admin)",
    description: "Get aggregate statistics about users",
  })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved",
    type: UserStatsDto,
  })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async getUserStats(@Request() req: AuthenticatedRequest): Promise<UserStatsDto> {
    const tenantId = req.tenantId!;
    return this.userService.getUserStats(tenantId);
  }

  /**
   * Export users to CSV (Admin)
   */
  @Get("export")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="users.csv"')
  @ApiOperation({
    summary: "Export users to CSV (Admin)",
    description: "Download all users as CSV file",
  })
  @ApiResponse({ status: 200, description: "CSV file" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async exportUsers(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListUsersQueryDto,
  ): Promise<string> {
    const tenantId = req.tenantId!;

    const options: ListUsersOptions = {
      ...query,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
    };
    return this.userService.exportUsers(tenantId, options);
  }

  /**
   * Bulk update users active status (Admin)
   */
  @Post("bulk/update-status")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({
    summary: "Bulk update user status (Admin)",
    description: "Activate or deactivate multiple users at once",
  })
  @ApiResponse({ status: 200, description: "Users updated" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async bulkUpdateStatus(@Request() req: AuthenticatedRequest, @Body() dto: BulkUpdateUsersDto) {
    const tenantId = req.tenantId!;
    const adminUserId = req.user.sub;

    const result = await this.userService.bulkUpdateActiveStatus(
      tenantId,
      dto.userIds,
      dto.isActive,
      adminUserId,
    );

    return {
      message: `Successfully updated ${result.updated} users`,
      updated: result.updated,
    };
  }
  // ------------------------------------------------------------
  // Invitations. Declared before the ":id" routes so "invites" is not read as a user id.
  // ------------------------------------------------------------

  @Get("invites")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "List pending invitations" })
  @ApiResponse({ status: 200, description: "Pending invitations (tokens are never returned)" })
  async listInvites(@Request() req: AuthenticatedRequest) {
    return this.userService.listPendingInvites(req.tenantId!);
  }

  @Delete("invites/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Revoke a pending invitation" })
  @ApiResponse({ status: 204, description: "Invitation revoked" })
  @ApiResponse({ status: 404, description: "Invitation not found" })
  @ApiResponse({ status: 409, description: "Invitation already accepted" })
  async revokeInvite(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.userService.revokeInvite(req.tenantId!, id, {
      userId: req.user.sub,
      email: req.user.email,
      ip: req.ip,
      requestId: req.requestId,
    });
  }

  /**
   * Get user by ID (Admin only)
   * Requires: users:read permission
   */
  @Get(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "Get user by ID (Admin)" })
  @ApiResponse({ status: 200, description: "User retrieved" })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async getUserById(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    return this.userService.findById(tenantId, id);
  }

  /**
   * Update user by ID (Admin only)
   * Requires: users:write permission
   */
  @Put(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Update user by ID (Admin)" })
  @ApiResponse({ status: 200, description: "User updated successfully" })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async updateUser(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const tenantId = req.tenantId!;
    await this.userService.adminUpdate(tenantId, id, req.user.sub, updateUserDto);
    return { message: "User updated successfully" };
  }

  /**
   * Delete user by ID (Admin only)
   * Requires: users:delete permission
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_DELETE)
  @ApiOperation({ summary: "Delete user by ID (Admin)" })
  @ApiResponse({ status: 204, description: "User deleted successfully" })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async deleteUser(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminDeleteUser(
      tenantId,
      id,
      req.user.sub,
      req.requestId,
    );
  }

  /**
   * Force password reset for user (Admin only)
   * Requires: users:write permission
   */
  @Post(":id/force-password-reset")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Force user to reset password (Admin)" })
  @ApiResponse({ status: 200, description: "Password reset forced" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async forcePasswordReset(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminForcePasswordReset(tenantId, id, req.user.sub);
    return { message: "User will be required to reset password on next login" };
  }

  /**
   * Lock/Unlock user account (Admin only)
   * Requires: users:write permission
   */
  @Post(":id/lock")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Lock user account (Admin)" })
  @ApiResponse({ status: 200, description: "User account locked" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async lockUser(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminLockUser(tenantId, id, req.user.sub);
    return { message: "User account locked" };
  }

  @Post(":id/unlock")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Unlock user account (Admin)" })
  @ApiResponse({ status: 200, description: "User account unlocked" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async unlockUser(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminUnlockUser(tenantId, id, req.user.sub);
    return { message: "User account unlocked" };
  }

  /**
   * Invite a user to the workspace
   * Requires: users:invite permission or admin role
   */
  @Post("invite")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Invite a user to the workspace" })
  @ApiResponse({ status: 201, description: "Invitation sent" })
  @ApiResponse({ status: 409, description: "User or pending invite already exists" })
  async inviteUser(
    @Request() req: AuthenticatedRequest,
    @Body() dto: InviteUserDto,
  ) {
    const tenantId = req.tenantId!;
    return this.userService.inviteUser(tenantId, req.user.sub, dto);
  }

  /**
   * List active sessions for a specific user (Admin only)
   * Requires: users:read permission
   */
  @Get(":id/sessions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "List active sessions for a user (Admin)" })
  @ApiResponse({ status: 200, description: "Sessions retrieved" })
  async getUserSessions(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const tenantId = req.tenantId!;
    return this.sessionManagementService.getActiveSessions(id, tenantId);
  }

  /**
   * Revoke a specific session for a user (Admin only)
   * Requires: users:write permission
   */
  @Delete(":id/sessions/:sessionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Revoke a session for a user (Admin)" })
  @ApiResponse({ status: 204, description: "Session revoked" })
  async revokeUserSession(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
  ) {
    const tenantId = req.tenantId!;
    await this.sessionManagementService.revokeSession(sessionId, id, tenantId, "admin_revoked");
  }

  /**
   * Get security events for a specific user (Admin only)
   * Requires: users:read permission
   */
  @Get(":id/security-events")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "Get security event history for a user (Admin)" })
  @ApiResponse({ status: 200, description: "Security events retrieved" })
  async getUserSecurityEvents(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("limit") limit: string = "50",
  ) {
    const tenantId = req.tenantId!;
    return this.userService.getSecurityEvents(tenantId, id, clampLimit(limit));
  }
}
