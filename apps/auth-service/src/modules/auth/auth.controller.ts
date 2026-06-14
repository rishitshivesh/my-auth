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
  UnauthorizedException,
  Res,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyMfaDto,
  RefreshTokenDto,
  LoginIntentRequestDto,
  LoginIntentResponseDto,
  SendMagicLinkDto,
  VerifyMagicLinkDto,
} from "./auth.dto";
import { JwtAuthGuard } from "@/common/guards";
import { logger } from "@/common/logger";
import { type Request, type Response } from "express";
import { FortKnoxProtectedGuard } from "@/common/guards/fortknox-protected-route.guard";
import { Protected } from "@/common/decorators/protected.decorator";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { access } from "fs";

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
  @RateLimit({ max: 3, windowMs: 3600000, keyBy: "ip" })
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
  @RateLimit({ max: 5, windowMs: 900000, keyBy: "ip" })
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
    @Res({passthrough: true}) res: Response,
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    const response = await this.authService.login({
      ...loginDto,
      ip,
      tenantId,
      userAgent: userAgent || "unknown",
    });

    if ('mfaRequired' in response) {
      return response;
    }

    if ('accessToken' in response && 'refreshToken' in response && 'user' in response) {
      res.cookie('refreshToken', response.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        // sameSite: 'none',
        sameSite: 'strict',
        domain: req.hostname,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/',
      });  
    }

    return {...response, refreshToken: null};

  }

  /**
   * Logout - revoke session
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @Protected()
  @ApiOperation({ summary: "Logout and revoke session" })
  @ApiResponse({ status: 200, description: "Logout successful" })
  async logout(
    @Req() req: any,
    @Res({passthrough: true}) res: Response,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    const userId = req.user.sub;
    const sessionId = req.user.sessionId;
    await this.authService.logout(tenantId, userId, sessionId, userAgent, ip);

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // sameSite: 'none',
      sameSite: 'strict',
      domain: req.hostname,
    });

    return { message: "Logged out successfully" };
  }

  /**
   * Request password reset
   */
  @Post("forgot-password")
  @RateLimit({ max: 3, windowMs: 3600000, keyBy: "ip" })
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
      resetPasswordDto.otp,
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
    @Res({passthrough: true}) res: Response,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    const refreshToken = req.cookies.refreshToken;

    const response = await this.authService.refreshToken(tenantId, refreshToken, ip, userAgent);

    if ('accessToken' in response && 'refreshToken' in response) {
      res.cookie('refreshToken', response.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days

      });
    }

    return { ...response, refreshToken: null};
  }

  /**
   * Get current authenticated user context
   *
   * This endpoint is critical for:
   * 1. Testing auth boundary works correctly
   * 2. Debugging token/session issues
   * 3. Frontend to get current user info
   *
   * Returns complete auth context:
   * - User info from JWT
   * - Tenant info
   * - Session info
   * - Permissions/roles (if loaded)
   */
  @Get("me")
  @Protected()
  @ApiOperation({
    summary: "Get current authenticated user",
    description:
      "Returns complete authentication context for debugging and user info display",
  })
  @ApiResponse({
    status: 200,
    description: "Current user context",
    schema: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
          },
        },
        tenant: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
          },
        },
        session: {
          type: "object",
          properties: {
            id: { type: "string" },
            createdAt: { type: "string" },
            lastActivity: { type: "string" },
            expiresAt: { type: "string" },
            ipAddress: { type: "string" },
            userAgent: { type: "string" },
          },
        },
        auth: {
          type: "object",
          properties: {
            method: { type: "string" },
            issuedAt: { type: "string" },
            expiresAt: { type: "string" },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid token or session",
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Tenant mismatch",
  })
  async getCurrentUser(@Req() req: any) {
    const user = req.user; // From JWT payload
    const session = req.fortknoxSession;
    const tenant = req.tenant; // From TenantResolverMiddleware

    // Fetch full user details
    const fullUser = await this.authService.getCurrentUser(
      tenant?.id!,
      user.sub,
    );

    if (!fullUser) {
      throw new UnauthorizedException("User not found");
    }

    return {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        emailVerified: fullUser.emailVerified,
        lastLoginAt: fullUser.lastLoginAt,
        lastLoginIp: fullUser.lastLoginIp,
      },
      tenant: {
        id: tenant?.id,
        name: tenant?.name,
        slug: tenant?.slug,
        customDomain: tenant?.customDomain,
      },
      session: {
        id: session.id,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        deviceId: session.deviceId,
      },
      auth: {
        method: "jwt",
        // issuedAt: new Date(user.iat * 1000).toISOString(),
        // expiresAt: new Date(user.exp * 1000).toISOString(),
        tokenTenant: user.tenantId,
        requestTenant: req.tenantId,
        tenantMatch: user.tenantId === req.tenantId,
      },
      debug: {
        guards: {
          jwtAuth: true,
          tenantBinding: true,
          session: true,
        },
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Verify MFA code and complete login
   */
  @Post("mfa/verify")
  @RateLimit({ max: 5, windowMs: 300000, keyBy: "user" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify MFA code and complete login",
    description:
      "After receiving mfaRequired=true from login, use this endpoint to verify the TOTP code",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        tempToken: {
          type: "string",
          description: "Temporary token from login response",
        },
        code: {
          type: "string",
          description: "6-digit TOTP code from authenticator app",
          pattern: "^\\d{6}$",
          example: "123456",
        },
      },
      required: ["tempToken", "code"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "MFA verified successfully, tokens issued",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        message: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Invalid MFA code or expired token",
  })
  async verifyMfa(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: VerifyMfaDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;

    try {
      const result = await this.authService.verifyMfa(
        tenantId,
        dto.tempToken,
        dto.code,
        ip,
        userAgent,
      );

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        domain: req.hostname,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return { status: 200, data: { accessToken: result.accessToken, message: result.message } };
    } catch (error: any) {
      logger.error({ err: error }, "MFA verification failed");

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  /**
   * Verify MFA using backup code
   */
  @Post("mfa/verify-backup")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify MFA using backup code",
    description: "Use a backup code when authenticator app is unavailable",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        tempToken: {
          type: "string",
          description: "Temporary token from login response",
        },
        code: {
          type: "string",
          description: "Backup code in format XXXX-XXXX",
          pattern: "^[A-Z0-9]{4}-[A-Z0-9]{4}$",
          example: "ABCD-1234",
        },
      },
      required: ["tempToken", "code"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "Backup code verified, tokens issued",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        message: { type: "string" },
        warning: {
          type: "string",
          description: "Warning about remaining backup codes",
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Invalid backup code",
  })
  async verifyMfaBackup(
    @Req() req: Request,
    @Body() dto: VerifyMfaDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;

    try {
      return await this.authService.verifyMfaBackup(
        tenantId,
        dto.tempToken,
        dto.code,
        ip,
        userAgent,
      );
    } catch (error: any) {
      logger.error({ err: error }, "Backup code verification failed");

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("Invalid backup code");
    }
  }

  // apps/auth-service/src/modules/auth/auth.controller.ts
  // CLEAN CONTROLLER - ONLY ROUTING

  /**
   * Start WebAuthn authentication (passwordless login)
   */
  @Post("webauthn/login/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Start passwordless WebAuthn login",
    description: "Initiate WebAuthn authentication flow",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
      },
      required: ["email"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "WebAuthn authentication options",
  })
  @ApiResponse({
    status: 401,
    description: "Invalid credentials",
  })
  async startWebAuthnLogin(
    @Req() req: Request,
    @Body() dto: { email: string },
  ) {
    const tenantId = req.tenantId!;

    return this.authService.startWebAuthnLogin(tenantId, dto.email);
  }

  /**
   * Finish WebAuthn authentication and get tokens
   */
  @Post("webauthn/login/finish")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Complete WebAuthn login",
    description: "Verify WebAuthn response and issue authentication tokens",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        response: {
          type: "object",
          description: "WebAuthn authentication response from browser",
        },
      },
      required: ["email", "response"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "Authentication successful",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        user: {
          type: "object",
          properties: {
            email: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            emailVerified: { type: "boolean" },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Authentication failed",
  })
  async finishWebAuthnLogin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: { email: string; response: any; sessionNonce: string },
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;

    const result = await this.authService.finishWebAuthnLogin({
      tenantId,
      email: dto.email,
      webauthnResponse: dto.response,
      sessionNonce: dto.sessionNonce,
      ip,
      userAgent,
    });

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      domain: req.hostname,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return { status: 200, data: { accessToken: result.accessToken } };
  }

  /**
   * Send magic link sign-in email
   */
  @Post("magic-link/send")
  @RateLimit({ max: 3, windowMs: 3600000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send magic link sign-in email" })
  @ApiResponse({ status: 200, description: "Magic link sent (or silently ignored if user not found)" })
  async sendMagicLink(
    @Req() req: Request,
    @Body() dto: SendMagicLinkDto,
  ) {
    const tenantId = req.tenantId!;
    await this.authService.sendMagicLink(tenantId, dto.email);
    return { status: 200, data: { message: "If an account exists, a magic link has been sent." } };
  }

  /**
   * Verify magic link token and create session
   */
  @Post("magic-link/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify magic link token" })
  @ApiResponse({ status: 200, description: "Authentication successful" })
  async verifyMagicLink(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: VerifyMagicLinkDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    const { accessToken, refreshToken } = await this.authService.verifyMagicLink(
      tenantId,
      dto.token,
      ip,
      userAgent || "unknown",
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      domain: req.hostname,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return { status: 200, data: { accessToken } };
  }

  /**
   * Login Intent - Check what auth methods are available for an email
   *
   * This is step 1 of the email-first login flow
   */
  @Post('login-intent')
  @ApiOperation({
    summary: 'Check available authentication methods',
    description: `
      Check what authentication methods are available for a given email address.
      This is the first step in the email-first login flow.
      
      Returns:
      - Whether the user exists
      - Available authentication methods (password, magic link, passkey, social)
      - Whether MFA is required
      - Preferred authentication method
      - Tenant branding information
      
      Use this to dynamically show the appropriate login options to the user.
    `,
  })
  @ApiBody({
    type: LoginIntentRequestDto,
    description: 'Email address to check',
    examples: {
      'Existing User': {
        value: {
          email: 'john@example.com',
        },
      },
      'New User': {
        value: {
          email: 'newuser@example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Available authentication methods returned successfully',
    type: LoginIntentResponseDto,
    examples: {
      'Existing User with Multiple Methods': {
        summary: "Existing User with Multiple Methods",
        value: {
          exists: true,
          email: 'john@example.com',
          methods: {
            password: true,
            magicLink: true,
            passkey: false,
            mfa: true,
            social: ['google', 'github'],
          },
          preferredMethod: 'password',
          branding: {
            logoUrl: 'https://cdn.example.com/logo.png',
            primaryColor: '#0066FF',
            backgroundColor: '#FFFFFF',
            textColor: '#000000',
            buttonColor: '#0066FF',
            buttonTextColor: '#FFFFFF',
            companyName: 'Acme Corp',
            supportEmail: 'support@acme.com',
          },
        },
      },
      'New User (Signup)': {
        "summary" : "New User (Signup)",
        value: {
          exists: false,
          email: 'newuser@example.com',
          methods: {
            password: true,
            magicLink: false,
            passkey: false,
            mfa: false,
            social: ['google', 'github'],
          },
          preferredMethod: 'password',
          branding: {
            primaryColor: '#0066FF',
            backgroundColor: '#FFFFFF',
            companyName: 'Acme Corp',
          },
        },
      },
      'Legacy User (Password Only)': {
        summary: "Legacy User (Password Only)",
        value: {
          exists: true,
          email: 'legacy@example.com',
          methods: {
            password: true,
            magicLink: false,
            passkey: false,
            mfa: false,
            social: [],
          },
          preferredMethod: 'password',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email format',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Invalid email format' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Tenant not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  async loginIntent(
    @Body() body: LoginIntentRequestDto,
    @Req() req: any,
  ): Promise<LoginIntentResponseDto> {
    const { email } = body;
    const tenantId = req.tenantId!; // From TenantResolverMiddleware

    logger.info({ email, tenantId }, "Login intent check");

    const result = await this.authService.getLoginIntent(email, tenantId);

    logger.info({ email, exists: result.exists, methods: result.methods, preferredMethod: result.preferredMethod }, "Login intent result");

    return result;
  }
}
