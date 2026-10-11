import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
  BadRequestException,
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
  LoginIntentRequestDto,
  LoginIntentResponseDto,
  SendMagicLinkDto,
  VerifyMagicLinkDto,
  GetProvidersQueryDto,
  GetProvidersResponseDto,
  AcceptInviteDto,
} from "./auth.dto";
import { JwtAuthGuard } from "@/common/guards";
import { logger } from "@/common/logger";
import { type Request, type Response } from "express";
import { SentryProtectedGuard } from "@/common/guards/sentry-protected-route.guard";
import { Protected } from "@/common/decorators/protected.decorator";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean; sessionId?: string; tenantId?: string };
  ip?: string;
  route?: { path: string };
  params?: Record<string, string>;
  hostname?: string;
  sentrySession?: { id: string; createdAt: string; lastActivity: string; expiresAt: string; ipAddress: string; userAgent: string; deviceId: string };
  tenant?: { id: string; name: string; slug: string; customDomain?: string };
}

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
   * Set both access and refresh tokens as httpOnly cookies.
   * Tokens are NEVER returned in the response body — cookie-only per project rules.
   *
   * accessToken maxAge = 15 min (matches RS256 JWT TTL)
   * refreshToken maxAge = 30 days (matches DB refresh token TTL)
   *
   * Set COOKIE_DOMAIN=.sentry.scrolloop.com in production so cookies are shared
   * across tenant subdomains (acme.sentry.scrolloop.com, beta.sentry.scrolloop.com).
   * Leave unset in development — defaults to exact hostname, works for localhost.
   */
  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = process.env['NODE_ENV'] === 'production';
    const domain = process.env['COOKIE_DOMAIN'] || undefined;

    const base = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      path: '/',
      ...(domain ? { domain } : {}),
    };

    res.cookie('accessToken', accessToken, { ...base, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }

  private clearAuthCookies(res: Response): void {
    const domain = process.env['COOKIE_DOMAIN'] || undefined;
    const base = { httpOnly: true, path: '/', ...(domain ? { domain } : {}) };
    res.clearCookie('accessToken', base);
    res.clearCookie('refreshToken', base);
  }

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
  @RateLimit({ max: 10, windowMs: 900000, keyBy: "ip" })
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
    @Res({ passthrough: true }) res: Response,
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

    if (!('accessToken' in response)) {
      return response;
    }

    this.setAuthCookies(res, response.accessToken, response.refreshToken);
    // Return access token in body so SDK clients can cache it in state.
    // Bearer token auth requires the SDK to hold the token in memory;
    // the httpOnly cookie provides fallback for server-side cookie auth.
    return { user: response.user, tenantSlug: response.tenantSlug, accessToken: response.accessToken };
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
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    const userId = req.user.sub;
    const sessionId = req.user.sessionId ?? '';
    await this.authService.logout(tenantId, userId, sessionId, userAgent, ip);

    this.clearAuthCookies(res);

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
  @RateLimit({ max: 10, windowMs: 900000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset password using token" })
  @ApiResponse({ status: 200, description: "Password reset successful" })
  @ApiResponse({ status: 400, description: "Invalid or expired token" })
  async resetPassword(
    @Req() req: Request,
    @Body() resetPasswordDto: ResetPasswordDto,
    @Ip() ip: string,
  ) {
    const tenantId = req.tenantId!;

    await this.authService.resetPassword(
      tenantId,
      resetPasswordDto.email,
      resetPasswordDto.otp,
      resetPasswordDto.password,
      ip,
    );
    return { message: "Password reset successfully" };
  }

  /**
   * Verify email address
   */
  @Post("verify-email")
  @RateLimit({ max: 20, windowMs: 900000, keyBy: "ip" })
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
  @RateLimit({ max: 3, windowMs: 3600000, keyBy: "ip" })
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
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    const refreshToken = req.cookies.refreshToken;

    const response = await this.authService.refreshToken(tenantId, refreshToken, ip, userAgent);

    this.setAuthCookies(res, response.accessToken, response.refreshToken);
    // Return the access token in the body so SDK clients can cache it in memory.
    // The httpOnly cookie is the authoritative token; this is a convenience copy.
    return { accessToken: response.accessToken };
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
  async getCurrentUser(@Req() req: AuthenticatedRequest) {
    const user = req.user; // From JWT payload
    const session = req.sentrySession;
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
      session: session ? {
        id: session.id,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        deviceId: session.deviceId,
      } : null,
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
  @RateLimit({ max: 15, windowMs: 300000, keyBy: "user" })
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

      this.setAuthCookies(res, result.accessToken, result.refreshToken);
      return { message: result.message, tenantSlug: result.tenantSlug };
    } catch (error: unknown) {
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
    @Res({ passthrough: true }) res: Response,
    @Body() dto: VerifyMfaDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;

    try {
      const result = await this.authService.verifyMfaBackup(
        tenantId,
        dto.tempToken,
        dto.code,
        ip,
        userAgent,
      );
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
      return { message: result.message, tenantSlug: result.tenantSlug, warning: result.warning };
    } catch (error: unknown) {
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
    @Res() res: Response,
    @Body() dto: { email: string; response: Record<string, unknown>; sessionNonce: string },
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;

    const result = await this.authService.finishWebAuthnLogin({
      tenantId,
      email: dto.email,
      webauthnResponse: dto.response as unknown as import("@simplewebauthn/server").AuthenticationResponseJSON,
      sessionNonce: dto.sessionNonce,
      ip,
      userAgent,
    });

    if ('status' in result) {
      res.cookie('mfa_enrollment_token', result.enrollmentToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        path: '/mfa/enroll',
        maxAge: 5 * 60 * 1000,
      });
      return res.json({ status: result.status });
    }
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.json({ user: result.user, tenantSlug: result.tenantSlug });
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
    @Res() res: Response,
    @Body() dto: VerifyMagicLinkDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;
    const result = await this.authService.verifyMagicLink(
      tenantId,
      dto.token,
      ip,
      userAgent || "unknown",
    );

    if ('status' in result) {
      res.cookie('mfa_enrollment_token', result.enrollmentToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        path: '/mfa/enroll',
        maxAge: 5 * 60 * 1000,
      });
      return res.json({ status: result.status });
    }
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.json({ tenantSlug: result.tenantSlug });
  }

  /**
   * Get enabled authentication providers for a tenant.
   *
   * Public endpoint — no authentication required.
   * The tenant is resolved from request context (hostname / X-Tenant-ID header).
   * Optional query params tenant_id / tenant_slug allow cross-tenant lookup for
   * superadmin tooling (middleware must still resolve the request tenant first).
   */
  @Get('providers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List enabled authentication providers',
    description: 'Returns which login methods (password, magic link, passkey, social) are enabled for the resolved tenant. Call this before showing the login screen to decide which options to render.',
  })
  @ApiResponse({
    status: 200,
    description: 'Provider list returned successfully',
    type: GetProvidersResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Tenant could not be resolved from request' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getProviders(
    @Query() query: GetProvidersQueryDto,
    @Req() req: Request,
  ): Promise<GetProvidersResponseDto> {
    const tenantId = query.tenant_id ?? (req as unknown as { tenantId?: string }).tenantId;

    if (!tenantId) {
      throw new BadRequestException(
        'Tenant could not be resolved. Pass an X-Tenant-ID header or use a tenant subdomain.',
      );
    }

    return this.authService.getProviders(tenantId);
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
        "summary": "New User (Signup)",
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
    @Req() req: AuthenticatedRequest,
  ): Promise<LoginIntentResponseDto> {
    const { email } = body;
    const tenantId = req.tenantId!; // From TenantResolverMiddleware

    logger.info({ email, tenantId }, "Login intent check");

    const result = await this.authService.getLoginIntent(email, tenantId);

    logger.info({ email, exists: result.exists, methods: result.methods, preferredMethod: result.preferredMethod }, "Login intent result");

    return result;
  }

  /**
   * Validate an invite token (public — no auth required)
   */
  @Get("invite/validate/:token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Validate an invite token" })
  @ApiResponse({ status: 200, description: "Invite metadata returned" })
  @ApiResponse({ status: 404, description: "Invite not found or expired" })
  async validateInvite(@Param("token") token: string) {
    return this.authService.validateInvite(token);
  }

  /**
   * Accept an invite and create the user account (public — no auth required)
   */
  @Post("invite/accept")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Accept an invite and create account" })
  @ApiResponse({ status: 201, description: "Account created" })
  @ApiResponse({ status: 400, description: "Expired or already accepted invite" })
  @ApiResponse({ status: 409, description: "Email already registered" })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.authService.acceptInvite({
      token: dto.token,
      name: dto.name,
      password: dto.password,
      ip,
      userAgent: userAgent ?? "unknown",
    });
  }
}
