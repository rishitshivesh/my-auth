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
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { type Request, type Response } from "express";
import { SocialAuthService, SocialProfile } from "./social-auth.service";
import { Protected } from "../../common/decorators/protected.decorator";

@ApiTags("Social Authentication")
@Controller("auth/social")
export class SocialAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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
    const state = Buffer.from(JSON.stringify({ tenantId, returnUrl })).toString("base64url");

    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow("INTERNAL_GOOGLE_CLIENT_ID"),
      redirect_uri: this.configService.getOrThrow("INTERNAL_GOOGLE_CALLBACK_URL"),
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
  async googleCallback(@Req() req: any, @Res() res: Response) {
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
    const state = Buffer.from(JSON.stringify({ tenantId, returnUrl })).toString("base64url");

    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow("INTERNAL_GITHUB_CLIENT_ID"),
      redirect_uri: this.configService.getOrThrow("INTERNAL_GITHUB_CALLBACK_URL"),
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
  async githubCallback(@Req() req: any, @Res() res: Response) {
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
    const state = Buffer.from(JSON.stringify({ tenantId, returnUrl })).toString("base64url");

    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow("INTERNAL_MICROSOFT_CLIENT_ID"),
      redirect_uri: this.configService.getOrThrow("INTERNAL_MICROSOFT_CALLBACK_URL"),
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
  async microsoftCallback(@Req() req: any, @Res() res: Response) {
    return this.handleSocialCallback(req, res);
  }

  // ============================================================
  // SHARED CALLBACK HANDLER
  // ============================================================

  /**
   * Handle OAuth callback for all providers — state-relay (Approach C)
   */
  private async handleSocialCallback(req: any, res: Response) {
    const profile: SocialProfile = req.user;

    // Decode our base64url state from query param
    let tenantId: string;
    let returnUrl: string;
    try {
      const stateRaw = req.query.state as string;
      const stateObj = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
      tenantId = stateObj.tenantId;
      returnUrl = stateObj.returnUrl || "";
    } catch {
      return res.redirect("/error?message=Invalid+state+parameter");
    }

    if (!tenantId) {
      return res.redirect("/error?message=Missing+tenant+ID");
    }

    // Validate returnUrl to prevent open redirect
    const portalUrl = this.configService.get("PORTAL_URL") || "http://localhost:3000";
    const allowedOrigins = [portalUrl, "http://localhost:3000", "http://localhost:3001"];
    const isSafeReturn = !returnUrl || allowedOrigins.some((o) => returnUrl.startsWith(o));
    const safeReturnUrl = isSafeReturn ? returnUrl : portalUrl;

    try {
      const result = await this.socialAuthService.handleCallback({
        tenantId,
        profile,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "unknown",
      });

      if (result.type === "link_required") {
        return res.redirect(
          `${safeReturnUrl}/u/link-required?email=${encodeURIComponent(result.email)}&provider=${result.provider}`,
        );
      }

      // Set refresh cookie (same pattern as regular login)
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        domain: req.hostname,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      // Create short-lived completion token (60s, one-time use by the portal)
      const completionToken = this.jwtService.sign(
        { accessToken: result.accessToken, type: "social_completion" },
        { secret: this.configService.get("JWT_SECRET"), expiresIn: "60s" },
      );

      return res.redirect(`${safeReturnUrl}/u/auth/callback?ct=${completionToken}`);
    } catch (error: any) {
      return res.redirect(`${safeReturnUrl}/u/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  // ============================================================
  // CLAIM SESSION (Approach C relay)
  // ============================================================

  /**
   * Claim social session using completion token
   *
   * POST /auth/social/claim-session { ct: completionToken }
   * Returns { accessToken } — refresh token is already in httpOnly cookie
   */
  @Post("claim-session")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Claim social session using completion token" })
  @ApiResponse({ status: 200, description: "Access token returned" })
  @ApiResponse({ status: 401, description: "Invalid or expired completion token" })
  async claimSession(@Body() body: { ct: string }) {
    try {
      const payload = this.jwtService.verify(body.ct, {
        secret: this.configService.get("JWT_SECRET"),
      });

      if (payload.type !== "social_completion") {
        throw new Error("Invalid token type");
      }

      return { status: 200, data: { accessToken: payload.accessToken } };
    } catch {
      throw new UnauthorizedException("Invalid or expired completion token");
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
    } catch (error: any) {
      return res.redirect(
        `/error?message=${encodeURIComponent(error.message)}`,
      );
    }
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
  async getConnections(@Req() req: any) {
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
  async unlinkAccount(@Req() req: any, @Param("provider") provider: string) {
    const userId = req.user.sub;
    const tenantId = req.tenantId;

    return this.socialAuthService.unlinkAccount(userId, tenantId, provider);
  }
}
