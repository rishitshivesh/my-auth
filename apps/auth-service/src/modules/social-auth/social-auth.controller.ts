import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Param,
  HttpCode,
  HttpStatus,
  Delete,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { type Request, type Response } from "express";
import * as crypto from "crypto";
import type { StringValue } from "ms";
import { consumeSocialState, issueSocialState } from "./social-state";
import { isAllowedReturnOrigin } from "@/common/security/return-origin";
import { ApiException } from "@/common/http";
import { SocialAuthService, SocialProfile } from "./social-auth.service";
import { Protected } from "../../common/decorators/protected.decorator";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { TenantService } from "@/modules/tenant/tenant.service";
import { SecurityEventService } from "@/common/service/security-event.service";
import {
  setAccessTokenCookie,
  setMfaEnrollmentCookie,
  setRefreshTokenCookie,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/common/http/auth-cookies";
import { ClaimSessionDto } from "./dto/claim-session.dto";

interface SocialCallbackRequest {
  tenantId?: string;
  user: SocialProfile;
  query: Record<string, string | undefined>;
  ip?: string;
  headers: Record<string, string | undefined>;
  hostname: string;
}

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean };
  ip?: string;
  route?: { path: string };
  params?: Record<string, string>;
}

@ApiTags("Social Authentication")
@Controller("auth/social")
export class SocialAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly jwksService: JwksService,
    private readonly tenantJobRunner: TenantJobRunner,
    private readonly tenantService: TenantService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  /**
   * The provider redirects to one shared callback host, so the request is resolved to that
   * host's tenant. The account must be read/written in the tenant named by the signed state.
   */
  private async inStateTenant<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) throw new ApiException("TENANT_NOT_FOUND");
    return this.tenantJobRunner.runInTenant(tenant.slug, async () => {
      const result = await work();
      await this.securityEvents.drain();
      return result;
    });
  }

  /** A provider with no client id/callback configured is simply not offered to this deployment. */
  private providerConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new ApiException("SOCIAL_PROVIDER_DISABLED");
    }
    return value;
  }

  private async signToken(payload: Record<string, unknown>, expiresIn: string, tenantId?: string): Promise<string> {
    const { kid, privateKey } = await this.jwksService.getCurrentSigningKey(tenantId);
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    return this.jwtService.sign(payload, {
      privateKey: privateKeyPem,
      algorithm: 'RS256',
      header: { alg: 'RS256', kid },
      expiresIn: expiresIn as StringValue,
    });
  }

  // ============================================================
  // GOOGLE OAUTH
  // ============================================================

  /**
   * Initiate Google OAuth flow
   *
   * GET /auth/social/google/login?tenant_id=xxx&return_url=https://app.example.com
   */
  @Get("google/login")
  @ApiOperation({ summary: "Login with Google" })
  @ApiQuery({ name: "tenant_id", required: true })
  @ApiQuery({ name: "return_url", required: false })
  googleLogin(@Req() req: Request, @Res() res: Response) {
    const tenantId = (req.query.tenant_id as string) || req.tenantId!;
    const returnUrl = (req.query.return_url as string) || "";
    const state = issueSocialState(res, { tenantId, returnUrl });

    const params = new URLSearchParams({
      client_id: this.providerConfig("INTERNAL_GOOGLE_CLIENT_ID"),
      redirect_uri: this.providerConfig("INTERNAL_GOOGLE_CALLBACK_URL"),
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      state,
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  /**
   * Google OAuth callback
   *
   * GET /auth/social/google/callback?code=xxx&state=xxx
   */
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  @ApiOperation({ summary: "Google OAuth callback" })
  async googleCallback(@Req() req: SocialCallbackRequest, @Res() res: Response) {
    return this.handleSocialCallback(req, res);
  }

  // ============================================================
  // GITHUB OAUTH
  // ============================================================

  /**
   * Initiate GitHub OAuth flow
   */
  @Get("github/login")
  @ApiOperation({ summary: "Login with GitHub" })
  @ApiQuery({ name: "tenant_id", required: true })
  @ApiQuery({ name: "return_url", required: false })
  githubLogin(@Req() req: Request, @Res() res: Response) {
    const tenantId = (req.query.tenant_id as string) || req.tenantId!;
    const returnUrl = (req.query.return_url as string) || "";
    const state = issueSocialState(res, { tenantId, returnUrl });

    const params = new URLSearchParams({
      client_id: this.providerConfig("INTERNAL_GITHUB_CLIENT_ID"),
      redirect_uri: this.providerConfig("INTERNAL_GITHUB_CALLBACK_URL"),
      scope: "user:email",
      state,
    });
    return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  }

  /**
   * GitHub OAuth callback
   */
  @Get("github/callback")
  @UseGuards(AuthGuard("github"))
  @ApiOperation({ summary: "GitHub OAuth callback" })
  async githubCallback(@Req() req: SocialCallbackRequest, @Res() res: Response) {
    return this.handleSocialCallback(req, res);
  }

  // ============================================================
  // MICROSOFT OAUTH
  // ============================================================

  /**
   * Initiate Microsoft OAuth flow
   */
  @Get("microsoft/login")
  @ApiOperation({ summary: "Login with Microsoft" })
  @ApiQuery({ name: "tenant_id", required: true })
  @ApiQuery({ name: "return_url", required: false })
  microsoftLogin(@Req() req: Request, @Res() res: Response) {
    const tenantId = (req.query.tenant_id as string) || req.tenantId!;
    const returnUrl = (req.query.return_url as string) || "";
    const state = issueSocialState(res, { tenantId, returnUrl });

    const params = new URLSearchParams({
      client_id: this.providerConfig("INTERNAL_MICROSOFT_CLIENT_ID"),
      redirect_uri: this.providerConfig("INTERNAL_MICROSOFT_CALLBACK_URL"),
      response_type: "code",
      scope: "openid email profile User.Read",
      response_mode: "query",
      state,
    });
    return res.redirect(
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
    );
  }

  /**
   * Microsoft OAuth callback
   */
  @Get("microsoft/callback")
  @UseGuards(AuthGuard("microsoft"))
  @ApiOperation({ summary: "Microsoft OAuth callback" })
  async microsoftCallback(@Req() req: SocialCallbackRequest, @Res() res: Response) {
    return this.handleSocialCallback(req, res);
  }

  // ============================================================
  // SHARED CALLBACK HANDLER
  // ============================================================

  /**
   * Handle OAuth callback for all providers — state-relay (Approach C)
   */
  private async handleSocialCallback(req: SocialCallbackRequest, res: Response) {
    const profile: SocialProfile = req.user;
    const strategy = profile.provider;

    // Signature, expiry and browser binding are verified before anything in the
    // state is trusted (login CSRF defence); the nonce cookie is single-use.
    const parsedState = consumeSocialState(req as unknown as Request, res, req.query.state);
    if (!parsedState) {
      return res.redirect("/error?message=Invalid+state+parameter");
    }

    // Detect link mode (authenticated user linking a social account)
    {
      if (parsedState["mode"] === "link" && parsedState["userId"]) {
        // The state is client-controlled: only a link token we signed for this
        // exact user/tenant may authorise attaching an identity to an account.
        const linkClaims = await this.socialAuthService.verifyLinkToken(
          String(parsedState.lt ?? ""),
        );
        if (
          linkClaims.userId !== parsedState.userId ||
          linkClaims.tenantId !== parsedState.tenantId
        ) {
          throw new ApiException("AUTH_TOKEN_INVALID");
        }
        const rawProfile = req.user as unknown as Record<string, unknown> & { emails?: Array<{ value: string }>; photos?: Array<{ value: string }> };
        await this.inStateTenant(parsedState.tenantId as string, () => this.socialAuthService.handleLinkCallback({
          userId: parsedState.userId as string,
          tenantId: parsedState.tenantId as string,
          profile: {
            provider: strategy,
            providerId:
              (rawProfile.id || rawProfile.sub || rawProfile.providerId) as string,
            email:
              (rawProfile.email || rawProfile.emails?.[0]?.value) as string,
            displayName:
              (rawProfile.displayName ||
              rawProfile.name ||
              rawProfile.login ||
              rawProfile.username) as string,
            avatarUrl:
              (rawProfile.photos?.[0]?.value ||
              rawProfile.avatar_url ||
              rawProfile.picture) as string | undefined,
            accessToken: (rawProfile.accessToken as string) || "",
          },
        }));
        const adminPortalUrl = this.configService.get<string>(
          "ADMIN_PORTAL_URL",
          "http://localhost:3000",
        );
        return res.redirect(
          `${adminPortalUrl}/u/auth/callback?mode=link&provider=${strategy}`,
        );
      }
    }

    const tenantId = parsedState["tenantId"];
    const returnUrl = parsedState["returnUrl"] || "";

    if (!tenantId) {
      return res.redirect("/error?message=Missing+tenant+ID");
    }

    // Validate returnUrl to prevent open redirect
    const portalUrl = this.configService.get("PORTAL_URL") || "http://localhost:3000";
    // Exact origin comparison: a prefix match (startsWith) lets
    // "https://portal.example.com.evil.test" or "...@evil.test" through, and
    // the redirect carries the session completion token (ASVS 5.1.5).
    const allowedOrigins = new Set<string>();
    try {
      allowedOrigins.add(new URL(portalUrl).origin);
    } catch {
      // misconfigured PORTAL_URL: only the fallback below applies
    }
    if (process.env["NODE_ENV"] !== "production") {
      allowedOrigins.add("http://localhost:3000");
      allowedOrigins.add("http://localhost:3001");
    }
    const isSafeReturn = !returnUrl || isAllowedReturnOrigin(returnUrl, allowedOrigins);
    const safeReturnUrl = isSafeReturn ? returnUrl.replace(/\/+$/, "") : portalUrl;

    try {
      const result = await this.inStateTenant(tenantId, () => this.socialAuthService.handleCallback({
        tenantId,
        profile,
        ipAddress: req.ip ?? '0.0.0.0',
        userAgent: req.headers["user-agent"] || "unknown",
      }));

      if (result.type === "link_required") {
        return res.redirect(
          `${safeReturnUrl}/u/link-required?email=${encodeURIComponent(result.email)}&provider=${result.provider}`,
        );
      }

      if (result.type === 'mfa_enrollment_required') {
        setMfaEnrollmentCookie(res, result.enrollmentToken);
        return res.redirect(`${safeReturnUrl}/mfa/enroll`);
      }

      // Refresh token: set now (we have it)
      setRefreshTokenCookie(res, result.refreshToken);

      // Create short-lived completion token (60s, one-time use by the portal)
      const completionToken = await this.signToken(
        { accessToken: result.accessToken, type: "social_completion" },
        "60s",
        tenantId,
      );

      return res.redirect(`${safeReturnUrl}/u/auth/callback?ct=${completionToken}`);
    } catch (error: unknown) {
      return res.redirect(`${safeReturnUrl}/u/login?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
  }

  // ============================================================
  // CLAIM SESSION (Approach C relay)
  // ============================================================

  /**
   * Claim social session using completion token
   *
   * POST /auth/social/claim-session { ct: completionToken }
   * Sets the access token as an httpOnly cookie; refresh token is already
   * cookied from the OAuth callback. Returns { tenantSlug, expiresIn } only.
   */
  @Post("claim-session")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Claim social session using completion token" })
  @ApiResponse({ status: 200, description: "Session claimed, accessToken set as httpOnly cookie" })
  @ApiResponse({ status: 401, description: "Invalid or expired completion token" })
  async claimSession(
    @Body() body: ClaimSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(body.ct);
      const payload = this.jwtService.verify(body.ct, {
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
        algorithms: ['RS256'],
      }) as Record<string, unknown>;

      if (payload['type'] !== "social_completion") {
        throw new Error("Invalid token type");
      }

      setAccessTokenCookie(res, payload['accessToken'] as string);

      // Non-secret claims so the client need not hold or decode the token (ADR-0003).
      const claims = (this.jwtService.decode(payload['accessToken'] as string) ?? {}) as Record<string, unknown>;
      const tenantSlug = (payload['tenantSlug'] as string) ?? '';
      return {
        tenantSlug,
        session: {
          tenantId: (claims['tenantId'] as string | undefined) ?? (payload['tenantId'] as string | undefined) ?? '',
          tenantSlug,
          groups: Array.isArray(claims['groups']) ? (claims['groups'] as string[]) : [],
        },
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      };
    } catch {
      throw new ApiException("AUTH_TOKEN_INVALID");
    }
  }

  // ============================================================
  // ACCOUNT LINKING
  // ============================================================

  /**
   * Confirm account linking
   *
   * GET /auth/social/link/confirm?token=xxx
   */
  @Get("link/confirm")
  @ApiOperation({ summary: "Confirm account linking" })
  @ApiQuery({ name: "token", required: true })
  async confirmLinking(@Query("token") token: string, @Res() res: Response) {
    try {
      const result = await this.socialAuthService.confirmLinking(token);

      // Redirect to success page
      const successUrl = new URL(
        `${process.env.INTERNAL_PORTAL_URL}/link-success`,
      );
      successUrl.searchParams.set("message", result.message);

      return res.redirect(successUrl.toString());
    } catch (error: unknown) {
      return res.redirect(
        `/error?message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`,
      );
    }
  }

  // ============================================================
  // ACCOUNT LINKING (authenticated users)
  // ============================================================

  @Post("link/token")
  @Protected()
  @HttpCode(HttpStatus.OK)
  async getLinkToken(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;
    // The ResponseInterceptor adds the {status, data} envelope; wrapping here doubled it.
    return this.socialAuthService.createLinkToken(userId, tenantId);
  }

  @Get("link/google")
  async linkGoogle(
    @Query("lt") linkToken: string,
    @Res() res: Response,
  ) {
    const payload = this.socialAuthService.verifyLinkToken(linkToken);
    const claims = await payload;
    const state = issueSocialState(res, {
      mode: "link",
      userId: claims.userId,
      tenantId: claims.tenantId,
      lt: linkToken,
    });
    const params = new URLSearchParams({
      client_id: this.providerConfig("INTERNAL_GOOGLE_CLIENT_ID"),
      redirect_uri: `${this.configService.get<string>("AUTH_SERVICE_URL", "http://localhost:3001")}/auth/social/google/callback`,
      response_type: "code",
      scope: "email profile",
      state,
    });
    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    );
  }

  @Get("link/github")
  async linkGithub(
    @Query("lt") linkToken: string,
    @Res() res: Response,
  ) {
    const payload = this.socialAuthService.verifyLinkToken(linkToken);
    const claims = await payload;
    const state = issueSocialState(res, {
      mode: "link",
      userId: claims.userId,
      tenantId: claims.tenantId,
      lt: linkToken,
    });
    const params = new URLSearchParams({
      client_id: this.providerConfig("INTERNAL_GITHUB_CLIENT_ID"),
      redirect_uri: `${this.configService.get<string>("AUTH_SERVICE_URL", "http://localhost:3001")}/auth/social/github/callback`,
      response_type: "code",
      scope: "user:email",
      state,
    });
    return res.redirect(
      `https://github.com/login/oauth/authorize?${params}`,
    );
  }

  @Get("link/microsoft")
  async linkMicrosoft(
    @Query("lt") linkToken: string,
    @Res() res: Response,
  ) {
    const payload = this.socialAuthService.verifyLinkToken(linkToken);
    const claims = await payload;
    const state = issueSocialState(res, {
      mode: "link",
      userId: claims.userId,
      tenantId: claims.tenantId,
      lt: linkToken,
    });
    const msTenant = this.configService.get<string>(
      "MICROSOFT_TENANT_ID",
      "common",
    );
    const params = new URLSearchParams({
      client_id: this.providerConfig("INTERNAL_MICROSOFT_CLIENT_ID"),
      redirect_uri: `${this.configService.get<string>("AUTH_SERVICE_URL", "http://localhost:3001")}/auth/social/microsoft/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return res.redirect(
      `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/authorize?${params}`,
    );
  }

  // ============================================================
  // MANAGE CONNECTIONS
  // ============================================================

  /**
   * Get user's social connections
   *
   * GET /auth/social/connections
   */
  @Get("connections")
  @Protected()
  @ApiOperation({ summary: "Get connected social accounts" })
  @ApiResponse({
    status: 200,
    description: "List of connected social accounts",
  })
  async getConnections(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;

    return this.socialAuthService.getUserConnections(userId, tenantId);
  }

  /**
   * Unlink social account
   *
   * DELETE /auth/social/connections/:provider
   */
  @Delete("connections/:provider")
  @Protected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unlink social account" })
  @ApiResponse({
    status: 200,
    description: "Social account unlinked",
  })
  async unlinkAccount(@Req() req: AuthenticatedRequest, @Param("provider") provider: string) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;

    return this.socialAuthService.unlinkAccount(userId, tenantId, provider);
  }
}
