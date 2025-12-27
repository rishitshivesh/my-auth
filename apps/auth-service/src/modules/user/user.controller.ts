import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { UserService } from "./user.service";
import { JwtAuthGuard } from "@/common/guards";
import { UpdateUserDto, ChangePasswordDto } from "./user.dto";

/**
 * User Controller
 *
 * Handles user management endpoints:
 * - Get user profile
 * - Update user profile
 * - Change password
 * - Get user sessions
 * - Delete account
 */
@ApiTags("Users")
@Controller("users")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Get current user profile
   */
  @Get("me")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "User profile retrieved" })
  async getProfile(@Request() req: any) {
    return this.userService.findById(req.user.sub);
  }

  /**
   * Update current user profile
   */
  @Put("me")
  @ApiOperation({ summary: "Update current user profile" })
  @ApiResponse({ status: 200, description: "Profile updated successfully" })
  @ApiResponse({ status: 400, description: "Bad request - validation failed" })
  async updateProfile(
    @Request() req: any,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    await this.userService.update(req.user.sub, updateUserDto);
    return { message: "Profile updated successfully" };
  }

  /**
   * Change password
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
    @Request() req: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.userService.changePassword(
      req.user.sub,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    return { message: "Password changed successfully" };
  }

  /**
   * Get active sessions for current user
   */
  @Get("me/sessions")
  @ApiOperation({ summary: "Get all active sessions" })
  @ApiResponse({ status: 200, description: "Sessions retrieved" })
  async getSessions(@Request() req: any) {
    return this.userService.getActiveSessions(req.user.sub);
  }

  /**
   * Revoke a specific session
   */
  @Delete("me/sessions/:sessionId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke a specific session" })
  @ApiResponse({ status: 200, description: "Session revoked" })
  @ApiResponse({ status: 404, description: "Session not found" })
  async revokeSession(
    @Request() req: any,
    @Param("sessionId") sessionId: string,
  ) {
    await this.userService.revokeSession(req.user.sub, sessionId);
    return { message: "Session revoked successfully" };
  }

  /**
   * Revoke all sessions except current
   */
  @Delete("me/sessions")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke all sessions except current" })
  @ApiResponse({ status: 200, description: "Sessions revoked" })
  async revokeAllSessions(@Request() req: any) {
    await this.userService.revokeAllSessions(req.user.sub);
    return { message: "All other sessions revoked successfully" };
  }

  /**
   * Get security events for current user
   */
  @Get("me/security-events")
  @ApiOperation({ summary: "Get security event history" })
  @ApiResponse({ status: 200, description: "Security events retrieved" })
  async getSecurityEvents(
    @Request() req: any,
    @Query("limit") limit: string = "50",
  ) {
    return this.userService.getSecurityEvents(
      req.user.sub,
      parseInt(limit, 10),
    );
  }

  /**
   * Delete account (soft delete)
   */
  @Delete("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete user account" })
  @ApiResponse({ status: 200, description: "Account deleted successfully" })
  async deleteAccount(@Request() req: any, @Body("password") password: string) {
    await this.userService.deleteAccount(req.user.sub, password);
    return { message: "Account deleted successfully" };
  }

  /**
   * Get user by ID (admin endpoint - to be protected with role guard later)
   */
  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiResponse({ status: 200, description: "User retrieved" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getUserById(@Param("id") id: string) {
    return this.userService.findById(id);
  }
}
