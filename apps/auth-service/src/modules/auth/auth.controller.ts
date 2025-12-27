import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  Get,
  UseGuards,
  Req,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "./auth.dto";
import { JwtAuthGuard } from "@/common/guards";
import { type Request } from "express";

/**
 * Authentication Controller
 *
 * Handles all authentication-related endpoints:
 * - Registration
 * - Login
 * - Logout
 * - Password reset
 * - Email verification
 */
@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user
   */
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a new user" })
  @ApiResponse({ status: 201, description: "User successfully registered" })
  @ApiResponse({ status: 400, description: "Bad request - validation failed" })
  @ApiResponse({ status: 409, description: "User already exists" })
  async register(
    @Req() req: Request,
    @Body() registerDto: RegisterDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    return this.authService.register({
      ...registerDto,
      tenantId,
      ip,
      userAgent: userAgent || "unknown",
    });
  }

  /**
   * Login with email and password
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - invalid credentials",
  })
  @ApiResponse({ status: 423, description: "Account locked" })
  async login(
    @Req() req: Request,
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    return this.authService.login({
      ...loginDto,
      ip,
      tenantId,
      userAgent: userAgent || "unknown",
    });
  }

  /**
   * Logout - revoke session
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout and revoke session" })
  @ApiResponse({ status: 200, description: "Logout successful" })
  async logout(@Req() req: any) {
    const tenantId = req.tenantId!;
    const userId = req.user.sub;
    const sessionId = req.user.sessionId;
    await this.authService.logout(tenantId, userId, sessionId);
    return { message: "Logged out successfully" };
  }

  /**
   * Request password reset
   */
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Request password reset email" })
  @ApiResponse({ status: 200, description: "Password reset email sent" })
  @ApiResponse({ status: 404, description: "User not found" })
  async forgotPassword(
    @Req() req: Request,
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Ip() ip: string,
  ) {
    const tenantId = req.tenantId!;
    await this.authService.forgotPassword(
      tenantId,
      forgotPasswordDto.email,
      ip,
    );
    return {
      message:
        "If an account exists with this email, a password reset link has been sent",
    };
  }

  /**
   * Reset password with token
   */
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset password using token" })
  @ApiResponse({ status: 200, description: "Password reset successful" })
  @ApiResponse({ status: 400, description: "Invalid or expired token" })
  async resetPassword(
    @Req() req: Request,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    const tenantId = req.tenantId!;

    await this.authService.resetPassword(
      tenantId,
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
    return { message: "Password reset successfully" };
  }

  /**
   * Verify email address
   */
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify email address" })
  @ApiResponse({ status: 200, description: "Email verified successfully" })
  @ApiResponse({ status: 400, description: "Invalid or expired token" })
  async verifyEmail(@Req() req: Request, @Body("token") token: string) {
    const tenantId = req.tenantId!;
    await this.authService.verifyEmail(tenantId, token);
    return { message: "Email verified successfully" };
  }

  /**
   * Resend verification email
   */
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resend email verification" })
  @ApiResponse({ status: 200, description: "Verification email sent" })
  async resendVerification(@Req() req: Request, @Body("email") email: string) {
    const tenantId = req.tenantId!;
    await this.authService.resendVerification(tenantId, email);
    return { message: "Verification email sent" };
  }

  /**
   * Refresh access token
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({ status: 200, description: "Token refreshed successfully" })
  @ApiResponse({ status: 401, description: "Invalid refresh token" })
  async refresh(
    @Req() req: Request,
    @Body("refreshToken") refreshToken: string,
  ) {
    const tenantId = req.tenantId!;

    return this.authService.refreshToken(tenantId, refreshToken);
  }

  /**
   * Get current user info (for testing JWT)
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user" })
  @ApiResponse({ status: 200, description: "User info retrieved" })
  async getMe(@Req() req: Request) {
    const tenantId = req.tenantId!;
    console.log(req.user);
    return this.authService.getCurrentUser(tenantId, req.user.sub);
  }
}
