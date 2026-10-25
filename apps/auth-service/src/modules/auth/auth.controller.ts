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
  ValidateResetLinkQueryDto,
  MfaVerifyDto,
  MfaTempTokenDto,
  EnrollTotpSetupDto,
  EnrollTotpConfirmDto,
  ReauthDto,
  PollMagicLinkDto,
  VerifyEmailDto,
  GetProvidersResponseDto,
  AcceptInviteDto,
} from "./auth.dto";
import { StartWebAuthnLoginDto, FinishWebAuthnLoginDto } from "./dto/webauthn-login.dto";
import { JwtAuthGuard } from "@/common/guards";
import { logger } from "@/common/logger";
import { ApiException } from "@/common/http";
import { type Request, type Response } from "express";
import { SentryProtectedGuard } from "@/common/guards/sentry-protected-route.guard";
import { Protected } from "@/common/decorators/protected.decorator";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import {
  clearAuthCookies,
  MFA_ENROLLMENT_COOKIE,
  setAccessTokenCookie,
  setAuthCookies,
  setMfaEnrollmentCookie,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/common/http/auth-cookies";
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

    setAuthCookies(res, response.accessToken, response.refreshToken);
    // Tokens are httpOnly cookies only (ADR-0003) — the body carries no
    // credential, just non-secret session metadata for the client to use.
    return {
      user: response.user,
      tenantSlug: response.tenantSlug,
      session: response.session,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
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

    clearAuthCookies(res);

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
      forgotPasswordDto.redirectUri,
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
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;

    const meta = { userAgent: userAgent || "unknown", requestId: req.requestId };
    if (resetPasswordDto.token) {
      const { redirectUri } = await this.authService.resetPasswordWithToken(tenantId, resetPasswordDto.token, resetPasswordDto.password, ip, meta);
      return { message: "Password reset successfully", ...(redirectUri ? { redirectUri } : {}) };
    } else {
      await this.authService.resetPassword(
        tenantId,
        resetPasswordDto.email ?? "",
        resetPasswordDto.otp ?? "",
        resetPasswordDto.password,
        ip,
        meta,
      );
    }
    return { message: "Password reset successfully" };
  }

  /**
   * Is this reset link still usable? Never consumes it, so email scanners and page loads are safe.
   * LINK_EXPIRED (410), LINK_ALREADY_USED (409) or AUTH_TOKEN_INVALID (401) otherwise.
   */
  @Get("reset-password/validate")
  @RateLimit({ max: 30, windowMs: 900000, keyBy: "ip" })
  @ApiOperation({ summary: "Check a password reset link without consuming it" })
  async validateResetLink(@Req() req: Request, @Query() query: ValidateResetLinkQueryDto) {
    return this.authService.validateResetLink(req.tenantId!, query.token);
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
    const { redirectUri } = await this.authService.verifyEmail(tenantId, token);
    return { message: "Email verified successfully", ...(redirectUri ? { redirectUri } : {}) };
  }

  /**
   * Resend verification email
   */
  @Post("resend-verification")
  @RateLimit({ max: 3, windowMs: 3600000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resend email verification" })
  @ApiResponse({ status: 200, description: "Verification email sent" })
  async resendVerification(@Req() req: Request, @Body("email") email: string, @Body("redirectUri") redirectUri?: string) {
    const tenantId = req.tenantId!;
    await this.authService.resendVerification(tenantId, email, typeof redirectUri === "string" ? redirectUri : undefined);
    return { message: "Verification email sent" };
  }

  /**
   * Refresh access token
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60000, keyBy: "ip" })
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
    const refreshToken: string | undefined = req.cookies.refreshToken;
    if (!refreshToken) {
      throw new ApiException("AUTH_TOKEN_INVALID");
    }

    const response = await this.authService.refreshToken(
      tenantId,
      refreshToken,
      ip,
      userAgent,
      req.requestId,
    );

    setAuthCookies(res, response.accessToken, response.refreshToken);
    // Tokens are httpOnly cookies only (ADR-0003) — no credential in the body.
    return {
      tenantSlug: response.tenantSlug,
      session: response.session,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
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
      throw new ApiException("AUTH_SESSION_REVOKED");
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
    description: "MFA verified successfully, tokens set as httpOnly cookies",
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        tenantSlug: { type: "string" },
        expiresIn: { type: "number" },
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
    @Body() dto: MfaVerifyDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const tenantId = req.tenantId!;

    try {
      const result = await this.authService.verifyMfa(
        tenantId,
        dto.tempToken,
        dto.code ?? "",
        ip,
        userAgent,
        {
          method: dto.method,
          webauthn: dto.method === "webauthn"
            ? { response: dto.webauthnResponse as never, sessionNonce: dto.sessionNonce ?? "" }
            : undefined,
        },
      );

      setAuthCookies(res, result.accessToken, result.refreshToken);
      return {
        message: result.message,
        tenantSlug: result.tenantSlug,
        session: result.session,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      };
    } catch (error: unknown) {
      logger.error({ err: error }, "MFA verification failed");

      if (error instanceof ApiException) {
        throw error;
      }

      throw new ApiException("AUTH_TOKEN_INVALID");
    }
  }

  /** Email a login-time code (only when email is an enrolled second factor). */
  @Post("mfa/request-email-otp")
  @RateLimit({ max: 5, windowMs: 600000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Email a second-factor code, authenticated by the mfa_pending token" })
  async requestMfaEmailOtp(@Req() req: Request, @Body() dto: MfaTempTokenDto) {
    await this.authService.requestMfaEmailOtp(req.tenantId!, dto.tempToken);
    return { message: "A code was sent to your email", expiresInSeconds: 600 };
  }

  /** Passkey assertion options for the login-time second factor. */
  @Post("mfa/webauthn/start")
  @RateLimit({ max: 10, windowMs: 600000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start a passkey second factor, authenticated by the mfa_pending token" })
  async startMfaWebAuthn(@Req() req: Request, @Body() dto: MfaTempTokenDto) {
    return this.authService.startMfaWebAuthn(req.tenantId!, dto.tempToken);
  }

  private enrollmentTokenFrom(req: Request, bodyToken?: string): string {
    const token = bodyToken || (req.cookies?.[MFA_ENROLLMENT_COOKIE] as string | undefined);
    if (!token) throw new ApiException("AUTH_TOKEN_INVALID");
    return token;
  }

  /** Pre-session TOTP enrollment (policy-required MFA). Token: body or mfa_enrollment_token cookie. */
  @Post("mfa/enroll/totp/setup")
  @RateLimit({ max: 10, windowMs: 900000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Begin TOTP enrollment with an enrollment token (no session yet)" })
  async enrollTotpSetup(@Req() req: Request, @Body() dto: EnrollTotpSetupDto) {
    return this.authService.enrollTotpSetup(req.tenantId!, this.enrollmentTokenFrom(req, dto.enrollmentToken));
  }

  /** Confirms the first code, enables TOTP and signs the user in (amr includes totp + mfa). */
  @Post("mfa/enroll/totp/confirm")
  @RateLimit({ max: 10, windowMs: 900000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirm TOTP enrollment, then issue the session cookies" })
  async enrollTotpConfirm(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: EnrollTotpConfirmDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const result = await this.authService.enrollTotpConfirm(
      req.tenantId!,
      this.enrollmentTokenFrom(req, dto.enrollmentToken),
      dto.code,
      ip,
      userAgent || "unknown",
    );
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.clearCookie(MFA_ENROLLMENT_COOKIE, { path: "/mfa/enroll" });
    return {
      backupCodes: result.backupCodes,
      tenantSlug: result.tenantSlug,
      session: result.session,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /** Passkey options for a step-up. */
  @Post("reauth/webauthn/start")
  @Protected()
  @RateLimit({ max: 10, windowMs: 300000, keyBy: "user" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start a passkey step-up" })
  async startReauthWebAuthn(@Req() req: AuthenticatedRequest) {
    return this.authService.startReauthWebAuthn(req.tenantId!, req.user.sub);
  }

  /**
   * Step-up: re-prove password, TOTP or passkey. Keeps the same session, refreshes its authTime
   * and reissues the access-token cookie, so @RequireRecentAuth endpoints pass again.
   */
  @Post("reauth")
  @Protected()
  @RateLimit({ max: 10, windowMs: 300000, keyBy: "user" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Step-up authentication for the current session" })
  async reauth(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ReauthDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const result = await this.authService.reauthenticate(
      req.tenantId!,
      req.user.sub,
      req.user.sessionId ?? "",
      {
        method: dto.method,
        password: dto.password,
        code: dto.code,
        webauthn: dto.method === "webauthn" ? { response: dto.webauthnResponse as never, sessionNonce: dto.sessionNonce ?? "" } : undefined,
      },
      { ip, userAgent: userAgent || "unknown" },
    );
    setAccessTokenCookie(res, result.accessToken);
    return { session: result.session, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
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
    description: "Backup code verified, tokens set as httpOnly cookies",
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        tenantSlug: { type: "string" },
        expiresIn: { type: "number" },
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
      setAuthCookies(res, result.accessToken, result.refreshToken);
      return {
        message: result.message,
        tenantSlug: result.tenantSlug,
        session: result.session,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        warning: result.warning,
      };
    } catch (error: unknown) {
      logger.error({ err: error }, "Backup code verification failed");

      if (error instanceof ApiException) {
        throw error;
      }

      throw new ApiException("AUTH_MFA_INVALID");
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
    @Body() dto: StartWebAuthnLoginDto,
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
    description: "Authentication successful, tokens set as httpOnly cookies",
    schema: {
      type: "object",
      properties: {
        tenantSlug: { type: "string" },
        expiresIn: { type: "number" },
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
    @Body() dto: FinishWebAuthnLoginDto,
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
      setMfaEnrollmentCookie(res, result.enrollmentToken);
      return res.json({ status: result.status });
    }
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.json({
      user: result.user,
      tenantSlug: result.tenantSlug,
      session: result.session,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
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
    const { pollingNonce, expiresInSeconds } = await this.authService.sendMagicLink(tenantId, dto.email, {
      redirectUri: dto.redirectUri,
      poll: dto.poll,
    });
    return {
      message: "If an account exists, a magic link has been sent.",
      expiresInSeconds,
      ...(pollingNonce ? { pollingNonce } : {}),
    };
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

    return this.respondMagicLink(res, result);
  }

  private respondMagicLink(
    res: Response,
    result: Awaited<ReturnType<AuthService["verifyMagicLink"]>>,
  ) {
    const redirect = result.redirectUri ? { redirectUri: result.redirectUri } : {};
    if ('mfaRequired' in result) {
      const { redirectUri: _r, ...rest } = result;
      return res.json({ ...rest, ...redirect });
    }
    if ('status' in result) {
      setMfaEnrollmentCookie(res, result.enrollmentToken);
      return res.json({ status: result.status, ...redirect });
    }
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.json({
      tenantSlug: result.tenantSlug,
      session: result.session,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      ...redirect,
    });
  }

  /**
   * Cross-device completion. The device that asked for the link polls with its pollingNonce; once
   * the link was verified on another device this answers like magic-link/verify (cookies / MFA
   * challenge / enrollment), otherwise `{ status: "pending" }`.
   */
  @Post("magic-link/poll")
  @RateLimit({ max: 60, windowMs: 60000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Complete a magic-link sign-in that was confirmed on another device" })
  async pollMagicLink(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: PollMagicLinkDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    const result = await this.authService.pollMagicLink(req.tenantId!, dto.pollingNonce, ip, userAgent || "unknown");
    if ("status" in result && result.status === "pending") return res.json({ status: "pending" });
    return this.respondMagicLink(res, result as Awaited<ReturnType<AuthService["verifyMagicLink"]>>);
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
      throw new ApiException("TENANT_NOT_FOUND", {
        detail: "Tenant could not be resolved. Pass an X-Tenant-ID header or use a tenant subdomain.",
      });
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

  /** Invitee asks for a fresh link when theirs expired. Rate limited per invitation (10 min) and IP. */
  @Post("invite/request-new")
  @RateLimit({ max: 5, windowMs: 3600000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send a new invitation link to the invited address" })
  async requestNewInvite(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    return this.authService.requestNewInvite(req.tenantId!, dto.token);
  }
}
