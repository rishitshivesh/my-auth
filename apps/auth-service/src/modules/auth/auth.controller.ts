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
  Request,
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
    @Body() registerDto: RegisterDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.authService.register({
      ...registerDto,
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
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.authService.login({
      ...loginDto,
      ip,
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
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.sub);
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
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Ip() ip: string,
  ) {
    await this.authService.forgotPassword(forgotPasswordDto.email, ip);
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
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.authService.resetPassword(
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
  async verifyEmail(@Body("token") token: string) {
    await this.authService.verifyEmail(token);
    return { message: "Email verified successfully" };
  }

  /**
   * Resend verification email
   */
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resend email verification" })
  @ApiResponse({ status: 200, description: "Verification email sent" })
  async resendVerification(@Body("email") email: string) {
    await this.authService.resendVerification(email);
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
  async refresh(@Body("refreshToken") refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  /**
   * Get current user info (for testing JWT)
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user" })
  @ApiResponse({ status: 200, description: "User info retrieved" })
  async getMe(@Request() req: any) {
    return this.authService.getCurrentUser(req.user.sub);
  }
}
