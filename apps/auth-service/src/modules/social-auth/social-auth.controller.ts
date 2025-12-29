import {
  Controller,
  Get,
  Post,
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
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { type Request, type Response } from "express";
import { SocialAuthService, SocialProfile } from "./social-auth.service";
import { Protected } from "../../common/decorators/protected.decorator";

@ApiTags("Social Authentication")
@Controller("auth/social")
export class SocialAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  // ============================================================
  // GOOGLE OAUTH
  // ============================================================

  /**
   * Initiate Google OAuth flow
   *
   * GET /auth/social/google/login?tenantId=xxx
   */
  @Get("google/login")
  @UseGuards(AuthGuard("google"))
  @ApiOperation({ summary: "Login with Google" })
  @ApiQuery({ name: "tenantId", required: true })
  googleLogin(@Req() req: Request) {
    // Passport handles redirect
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
  @UseGuards(AuthGuard("github"))
  @ApiOperation({ summary: "Login with GitHub" })
  @ApiQuery({ name: "tenantId", required: true })
  githubLogin(@Req() req: Request) {
    // Passport handles redirect
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
  @UseGuards(AuthGuard("microsoft"))
  @ApiOperation({ summary: "Login with Microsoft" })
  @ApiQuery({ name: "tenantId", required: true })
  microsoftLogin(@Req() req: Request) {
    // Passport handles redirect
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
   * Handle OAuth callback for all providers
   */
  private async handleSocialCallback(req: any, res: Response) {
    const profile: SocialProfile = req.user;
    const tenantId = req.query.tenantId || req.session?.tenantId;

    if (!tenantId) {
      return res.redirect(`/error?message=Missing tenant ID`);
    }

    try {
      // Handle callback via service
      const result = await this.socialAuthService.handleCallback({
        tenantId,
        profile,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "unknown",
      });

      if (result.type === "success") {
        // Success! Redirect to app with tokens
        const redirectUrl = new URL(
          process.env.PORTAL_URL || "http://localhost:3000",
        );
        redirectUrl.searchParams.set("access_token", result.accessToken);
        redirectUrl.searchParams.set("refresh_token", result.refreshToken);

        return res.redirect(redirectUrl.toString());
      }

      if (result.type === "link_required") {
        // Account linking required
        const linkUrl = new URL(
          `${process.env.AUTH_SERVICE_URL}/link-required`,
        );
        linkUrl.searchParams.set("email", result.email);
        linkUrl.searchParams.set("provider", result.provider);
        linkUrl.searchParams.set("message", result.message);

        return res.redirect(linkUrl.toString());
      }
    } catch (error: any) {
      return res.redirect(
        `/error?message=${encodeURIComponent(error.message)}`,
      );
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
      const successUrl = new URL(`${process.env.PORTAL_URL}/link-success`);
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
