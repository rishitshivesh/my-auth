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
import { UserService } from "./user.service";
import {
  UpdateUserDto,
  ChangePasswordDto,
  UserStatsDto,
  ListUsersQueryDto,
  BulkUpdateUsersDto,
  ListUsersResponseDto,
} from "./user.dto";
import { JwtAuthGuard } from "@/common/guards";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Protected } from "@/common/decorators/protected.decorator";

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean };
  ip?: string;
  route?: { path: string };
  params?: Record<string, string>;
}

@ApiTags("Users")
@Controller("users")
@Protected()
export class UserController {
  constructor(private readonly userService: UserService) {}

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
    await this.userService.revokeAllSessions(tenantId, req.user.sub);
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
      parseInt(limit, 10),
    );
  }

  /**
   * Delete own account (soft delete)
   * Anyone authenticated can delete their own account
   */
  @Delete("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete user account" })
  @ApiResponse({ status: 200, description: "Account deleted successfully" })
  async deleteAccount(@Request() req: AuthenticatedRequest, @Body("password") password: string) {
    const tenantId = req.tenantId!;
    await this.userService.deleteAccount(tenantId, req.user.sub, password);
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
  @RequirePermissions("users:read")
  @ApiOperation({ summary: "List all users (Admin)" })
  @ApiResponse({ status: 200, description: "Users retrieved" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async listUsers(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListUsersQueryDto,
  ): Promise<ListUsersResponseDto> {
    const tenantId = req.tenantId!;

    // Convert date strings to Date objects
    const options: ListUsersQueryDto & { createdAfter?: Date; createdBefore?: Date } = { ...query };
    if (query.createdAfter) {
      options.createdAfter = new Date(query.createdAfter);
    }
    if (query.createdBefore) {
      options.createdBefore = new Date(query.createdBefore);
    }

    return this.userService.listUsers(tenantId, options);
  }

  /**
   * Get user statistics (Admin)
   */
  @Get("stats")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:read")
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
  @RequirePermissions("users:read")
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

    const options: ListUsersQueryDto & { createdAfter?: Date; createdBefore?: Date } = { ...query };
    if (query.createdAfter) {
      options.createdAfter = new Date(query.createdAfter);
    }
    if (query.createdBefore) {
      options.createdBefore = new Date(query.createdBefore);
    }

    return this.userService.exportUsers(tenantId, options);
  }

  /**
   * Bulk update users active status (Admin)
   */
  @Post("bulk/update-status")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:write")
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
  /**
   * Get user by ID (Admin only)
   * Requires: users:read permission
   */
  @Get(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:read")
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
  @RequirePermissions("users:write")
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
    await this.userService.update(tenantId, id, updateUserDto);
    return { message: "User updated successfully" };
  }

  /**
   * Delete user by ID (Admin only)
   * Requires: users:delete permission
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:delete")
  @ApiOperation({ summary: "Delete user by ID (Admin)" })
  @ApiResponse({ status: 204, description: "User deleted successfully" })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async deleteUser(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminDeleteUser(tenantId, id);
  }

  /**
   * Force password reset for user (Admin only)
   * Requires: users:write permission
   */
  @Post(":id/force-password-reset")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:write")
  @ApiOperation({ summary: "Force user to reset password (Admin)" })
  @ApiResponse({ status: 200, description: "Password reset forced" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async forcePasswordReset(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminForcePasswordReset(tenantId, id);
    return { message: "User will be required to reset password on next login" };
  }

  /**
   * Lock/Unlock user account (Admin only)
   * Requires: users:write permission
   */
  @Post(":id/lock")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:write")
  @ApiOperation({ summary: "Lock user account (Admin)" })
  @ApiResponse({ status: 200, description: "User account locked" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async lockUser(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminLockUser(tenantId, id);
    return { message: "User account locked" };
  }

  @Post(":id/unlock")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:write")
  @ApiOperation({ summary: "Unlock user account (Admin)" })
  @ApiResponse({ status: 200, description: "User account unlocked" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async unlockUser(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.userService.adminUnlockUser(tenantId, id);
    return { message: "User account unlocked" };
  }
}
