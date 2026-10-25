import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Delete,
  Put,
} from "@nestjs/common";
import { SessionGuard } from "@/common/guards/session.guard";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiHeader,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@/common/guards";
import { OAuthClientService } from "./services/oauth-client.service";
import { OAuthTokenService } from "./services/oauth-token.service";
import { OAuthConsentService } from "./services/oauth-consent.service";
import {
  AuthorizeRequestDto,
  TokenRequestDto,
  TokenResponseDto,
  TokenErrorResponseDto,
  UserInfoResponseDto,
  RevokeTokenRequestDto,
  IntrospectTokenRequestDto,
  IntrospectTokenResponseDto,
  CreateOAuthClientDto,
  UpdateOAuthClientDto,
  OAuthClientResponseDto,
  CreateClientResponseDto,
  OpenIDConfigurationDto,
  JWKSResponseDto,
} from "./dto";
import { ConfigService } from "@nestjs/config";
import { type Request, type Response } from "express";
import { PermissionsGuard } from "../rbac/guards/permissions.guard";
import { RequirePermissions } from "../rbac/decorators/rbac.decorator";
import { Permissions } from "../rbac/constants/permissions.catalog";
import { JwksService } from "./services/jwks.service";
import { buildOpenIdConfiguration } from "./openid-configuration";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { logger } from "@/common/logger";
import { OAuthClient } from "@repo/database";
import { ApiException } from "@/common/http";
import { oauthError } from "./oauth-errors";
import { RawResponse } from "@/common/decorators/raw-response.decorator";

interface JwtUser {
  sub: string;
  userId: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  tenantId?: string;
}

@ApiTags("OAuth2/OIDC")
@Controller("oauth")
export class OAuthController {
  constructor(
    private clientService: OAuthClientService,
    private tokenService: OAuthTokenService,
    private consentService: OAuthConsentService,
    private configService: ConfigService,
    private jwksService: JwksService,
  ) {}

  private parseClientCredentials(
    authHeader?: string,
    bodyClientId?: string,
    bodyClientSecret?: string,
  ): { clientId?: string; clientSecret?: string } {
    if (authHeader && /^basic /i.test(authHeader)) {
      const encoded = authHeader.slice(6).trim();
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const isCanonicalBase64 =
        /^[A-Za-z0-9+/]+={0,2}$/.test(encoded) &&
        Buffer.from(decoded, "utf-8").toString("base64") === encoded;
      const separator = decoded.indexOf(":");
      if (!isCanonicalBase64 || separator < 0) {
        throw oauthError("invalid_client", "Malformed Basic authorization header");
      }
      // RFC 6749 2.3.1: id and secret are form-urlencoded before Basic encoding.
      // Only the FIRST colon separates them (secrets may contain ':').
      let clientId: string;
      let clientSecret: string;
      try {
        clientId = decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, " "));
        clientSecret = decodeURIComponent(decoded.slice(separator + 1).replace(/\+/g, " "));
      } catch {
        throw oauthError("invalid_client", "Malformed Basic authorization header");
      }
      if (!clientId) {
        throw oauthError("invalid_client", "client_id required");
      }
      return { clientId, clientSecret };
    }
    return { clientId: bodyClientId, clientSecret: bodyClientSecret };
  }

  // ============================================================
  // TOKEN ENDPOINT
  // ============================================================

  @RawResponse()
  @Post("token")
  @RateLimit({ max: 10, windowMs: 60000, keyBy: "ip" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "OAuth2 Token Endpoint",
    description:
      "Exchange authorization code or refresh token for access token",
  })
  @ApiBody({ type: TokenRequestDto })
  @ApiResponse({
    status: 200,
    description: "Token issued successfully",
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request",
    type: TokenErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Invalid credentials",
    type: TokenErrorResponseDto,
  })
  async token(
    @Body() body: TokenRequestDto,
    @Req() req: Request,
    @Headers("authorization") authHeader?: string,
  ): Promise<TokenResponseDto> {
    const tenantId = req.tenantId!;

    const { clientId, clientSecret } = this.parseClientCredentials(
      authHeader,
      body.client_id,
      body.client_secret,
    );

    if (!clientId) {
      throw oauthError("invalid_request", "client_id required");
    }

    const client = await this.clientService.validateClient(
      clientId,
      clientSecret,
    );

    if (!body.grant_type) {
      throw oauthError("invalid_request", "grant_type required");
    }

    // A client may only use the grant types it was registered for (RFC 6749 5.2 unauthorized_client).
    if (["authorization_code", "refresh_token", "client_credentials"].includes(body.grant_type)) {
      await this.clientService.validateGrantType(client, body.grant_type);
    }

    // Handle different grant types
    switch (body.grant_type) {
      case "authorization_code":
        return this.handleAuthorizationCodeGrant(
          tenantId,
          client,
          body,
          req.ip,
          req.get("user-agent"),
        );

      case "refresh_token":
        return this.handleRefreshTokenGrant(
          tenantId,
          client,
          body,
          req.ip,
          req.get("user-agent"),
        );

      case "client_credentials":
        return this.handleClientCredentialsGrant(
          tenantId,
          client,
          body,
          req.ip,
          req.get("user-agent"),
        );

      default:
        throw oauthError("unsupported_grant_type", "Unsupported grant_type");
    }
  }

  /**
   * Handle authorization code grant
   */
  private async handleAuthorizationCodeGrant(
    tenantId: string,
    client: OAuthClient,
    body: TokenRequestDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenResponseDto> {
    if (!body.code) {
      throw oauthError("invalid_request", "code required");
    }

    if (!body.redirect_uri) {
      throw oauthError("invalid_request", "redirect_uri required");
    }

    // Validate and consume authorization code
    const authCode = await this.tokenService.validateAuthorizationCode(
      body.code,
      client.id,
      body.redirect_uri,
      body.code_verifier,
    );

    // Create access token
    const accessToken = await this.tokenService.createAccessToken(
      {
        tenantId,
        clientId: client.id,
        userId: authCode.userId,
        sessionId: authCode.sessionId,
        scope: authCode.scope,
        ipAddress,
        userAgent,
      },
      authCode.user,
    );

    // Create refresh token
    const refreshToken = await this.tokenService.createRefreshToken({
      tenantId,
      clientId: client.id,
      userId: authCode.userId,
      sessionId: authCode.sessionId,
      scope: authCode.scope,
      ipAddress,
      userAgent,
    });

    // Create ID token (if openid scope)
    let idToken: string | undefined;
    if (authCode.scope?.includes("openid")) {
      idToken = await this.tokenService.createIDToken(
        authCode.user,
        client,
        authCode.nonce,
        {
          sessionId: authCode.sessionId,
          authTime: authCode.authTime,
          amr: authCode.amr ? authCode.amr.split(" ") : undefined,
        },
      );
    }

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: client.accessTokenTtl,
      refresh_token: refreshToken,
      id_token: idToken,
      scope: authCode.scope,
    };
  }

  /**
   * Handle refresh token grant
   */
  private async handleRefreshTokenGrant(
    tenantId: string,
    client: OAuthClient,
    body: TokenRequestDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenResponseDto> {
    if (!body.refresh_token) {
      throw oauthError("invalid_request", "refresh_token required");
    }

    // Validate refresh token
    const refreshToken = await this.tokenService.validateRefreshToken(
      body.refresh_token,
    );

    // Verify client matches
    if (refreshToken.clientId !== client.id) {
      throw oauthError("invalid_grant", "Refresh token was issued to another client");
    }

    // Rotate refresh token
    const newRefreshToken =
      await this.tokenService.rotateRefreshToken(refreshToken);

    // Create new access token
    const accessToken = await this.tokenService.createAccessToken(
      {
        tenantId,
        clientId: client.id,
        userId: refreshToken.userId,
        sessionId: refreshToken.sessionId,
        scope: refreshToken.scope,
        ipAddress,
        userAgent,
      },
      refreshToken.user,
    );

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: client.accessTokenTtl,
      refresh_token: newRefreshToken,
      scope: refreshToken.scope,
    };
  }

  /**
   * Handle client credentials grant (M2M)
   */
  private async handleClientCredentialsGrant(
    tenantId: string,
    client: OAuthClient,
    body: TokenRequestDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenResponseDto> {
    // Client must be confidential
    if (client.clientType !== "confidential") {
      throw oauthError("unauthorized_client", "client_credentials requires a confidential client");
    }

    // Validate scopes
    const requestedScopes = body.scope ? body.scope.split(" ") : [];
    const grantedScopes = await this.clientService.validateScopes(
      client,
      requestedScopes,
    );

    // Create access token (no user)
    const accessToken = await this.tokenService.createAccessToken({
      tenantId,
      clientId: client.id,
      userId: undefined, // M2M token
      scope: grantedScopes.join(" "),
      ipAddress,
      userAgent,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: client.accessTokenTtl,
      scope: grantedScopes.join(" "),
    };
  }

  // ============================================================
  // USERINFO ENDPOINT
  // ============================================================

  @RawResponse()
  @Get("userinfo")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "OIDC UserInfo Endpoint",
    description: "Get authenticated user information",
  })
  @ApiResponse({
    status: 200,
    description: "User information",
    type: UserInfoResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
  })
  async userInfo(@Req() req: Request): Promise<UserInfoResponseDto> {
    const user = req.user as JwtUser;

    // OAuth-issued tokens are tracked server-side; enforce revocation for them.
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    if (bearer && this.isOAuthAccessToken(bearer)) {
      await this.tokenService.validateAccessToken(bearer);
    }

    return {
      sub: user.userId,
      email: user.email ?? '',
      email_verified: true, // TODO: Get from user entity
      name: user.name,
      given_name: user.given_name,
      family_name: user.family_name,
      picture: user.picture,
      updated_at: Math.floor(Date.now() / 1000),
    };
  }

  private isOAuthAccessToken(token: string): boolean {
    try {
      const payloadPart = token.split(".")[1] ?? "";
      const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as {
        token_type?: string;
      };
      return payload.token_type === "access_token";
    } catch {
      return false;
    }
  }

  // ============================================================
  // REVOKE ENDPOINT
  // ============================================================

  @RawResponse()
  @Post("revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "OAuth2 Token Revocation",
    description: "Revoke an access or refresh token",
  })
  @ApiBody({ type: RevokeTokenRequestDto })
  @ApiResponse({
    status: 200,
    description: "Token revoked (always returns 200 even if token invalid)",
  })
  async revoke(
    @Body() body: RevokeTokenRequestDto,
    @Headers("authorization") authHeader?: string,
  ): Promise<void> {
    const { clientId, clientSecret } = this.parseClientCredentials(authHeader);
    if (clientId) {
      try {
        await this.clientService.validateClient(clientId, clientSecret);
      } catch {
        logger.warn({ clientId }, "Revoke attempt with invalid client credentials");
        throw oauthError("invalid_client", "Invalid client credentials");
      }
    }

    try {
      if (body.token_type_hint === "refresh_token") {
        await this.tokenService.revokeRefreshToken(body.token);
      } else {
        await this.tokenService.revokeAccessToken(body.token);
      }
    } catch {
      // Silently fail per RFC 7009
    }
  }

  // ============================================================
  // INTROSPECT ENDPOINT
  // ============================================================

  @RawResponse()
  @Post("introspect")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "OAuth2 Token Introspection",
    description: "Get token metadata",
  })
  @ApiBody({ type: IntrospectTokenRequestDto })
  @ApiResponse({
    status: 200,
    description: "Token metadata",
    type: IntrospectTokenResponseDto,
  })
  async introspect(
    @Body() body: IntrospectTokenRequestDto,
    @Headers("authorization") authHeader?: string,
  ): Promise<IntrospectTokenResponseDto> {
    const { clientId, clientSecret } = this.parseClientCredentials(authHeader);
    if (!clientId) {
      throw oauthError("invalid_client", "Client authentication required");
    }
    await this.clientService.validateClient(clientId, clientSecret);

    return this.tokenService.introspectToken(body.token, body.token_type_hint) as unknown as Promise<IntrospectTokenResponseDto>;
  }

  // ============================================================
  // DISCOVERY ENDPOINTS
  // ============================================================

  @RawResponse()
  @Get(".well-known/openid-configuration")
  @ApiOperation({
    summary: "OpenID Connect Discovery",
    description: "Get OpenID Connect configuration",
  })
  @ApiResponse({
    status: 200,
    description: "OpenID configuration",
    type: OpenIDConfigurationDto,
  })
  getOpenIDConfiguration(): OpenIDConfigurationDto {
    return buildOpenIdConfiguration(this.configService);
  }

  @RawResponse()
  @Get("jwks")
  @ApiOperation({
    summary: "JSON Web Key Set",
    description: "Get public keys for JWT verification",
  })
  @ApiResponse({
    status: 200,
    description: "JWKS",
    type: JWKSResponseDto,
  })
  async getJWKS(@Req() req: Request): Promise<JWKSResponseDto> {
    const tenantId = req.tenantId;
    const keys = await this.jwksService.getVerificationKeys(tenantId);
    return { keys } as JWKSResponseDto;
  }

  // ============================================================
  // CLIENT MANAGEMENT (Admin endpoints)
  // ============================================================
  //
  // @Post("clients")
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({
  //   summary: "Create OAuth Client",
  //   description: "Register a new OAuth2 client application",
  // })
  // @ApiBody({ type: CreateOAuthClientDto })
  // @ApiResponse({
  //   status: 201,
  //   description: "Client created",
  //   type: CreateClientResponseDto,
  // })
  // async createClient(
  //   @Body() dto: CreateOAuthClientDto,
  //   @Req() req: Request,
  // ): Promise<CreateClientResponseDto> {
  //   const tenantId = req.tenantId!;
  //   const userId = (req.user as any).userId;
  //
  //   const { client, clientSecret } = await this.clientService.createClient({
  //     tenantId,
  //     ...dto,
  //     createdBy: userId,
  //   });
  //
  //   return {
  //     ...client,
  //     clientSecret,
  //   } as any;
  // }
  //
  // @Get("clients")
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({
  //   summary: "List OAuth Clients",
  //   description: "Get all OAuth2 clients for current tenant",
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: "List of clients",
  //   type: [OAuthClientResponseDto],
  // })
  // async listClients(@Req() req: Request) {
  //   const tenantId = req.tenantId!;
  //
  //   const { clients } = await this.clientService.listClients(tenantId, {
  //     isActive: true,
  //   });
  //
  //   return clients;
  // }
  //
  // @Get("clients/:clientId")
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({
  //   summary: "Get OAuth Client",
  //   description: "Get OAuth2 client details",
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: "Client details",
  //   type: OAuthClientResponseDto,
  // })
  // async getClient(@Param("clientId") clientId: string) {
  //   return this.clientService.getClient(clientId);
  // }

  // ============================================================
  // CLIENT MANAGEMENT (Protected with RBAC)
  // ============================================================

  /**
   * Create OAuth Client
   * Requires: clients:write permission
   * Only developers and admins can create OAuth clients
   */
  @Post("clients")
  @UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
  @RequirePermissions(Permissions.CLIENTS_WRITE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create OAuth Client (Requires: clients:write)",
    description: "Register a new OAuth2 client application",
  })
  @ApiBody({ type: CreateOAuthClientDto })
  @ApiResponse({
    status: 201,
    description: "Client created",
    type: CreateClientResponseDto,
  })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async createClient(
    @Body() dto: CreateOAuthClientDto,
    @Req() req: Request,
  ): Promise<CreateClientResponseDto> {
    const tenantId = req.tenantId!;
    const userId = (req.user as JwtUser).sub;

    const { client, clientSecret } = await this.clientService.createClient({
      ...dto,
      // Must follow the spread: the request tenant can never be overridden by the body.
      tenantId,
      createdBy: userId,
    });

    return {
      ...client,
      clientSecret, // Only shown once!
    } as CreateClientResponseDto;
  }

  /**
   * List OAuth Clients
   * Requires: clients:read permission
   */
  @Get("clients")
  @UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
  @RequirePermissions(Permissions.CLIENTS_READ)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List OAuth Clients (Requires: clients:read)",
    description: "Get all OAuth2 clients for current tenant",
  })
  @ApiResponse({
    status: 200,
    description: "List of clients",
    type: [OAuthClientResponseDto],
  })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async listClients(@Req() req: Request) {
    const tenantId = req.tenantId!;

    const { clients } = await this.clientService.listClients(tenantId, {
      isActive: true,
    });

    return clients;
  }

  /**
   * Get OAuth Client
   * Requires: clients:read permission
   */
  @Get("clients/:clientId")
  @UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
  @RequirePermissions(Permissions.CLIENTS_READ)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get OAuth Client (Requires: clients:read)",
    description: "Get OAuth2 client details",
  })
  @ApiResponse({
    status: 200,
    description: "Client details",
    type: OAuthClientResponseDto,
  })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async getClient(@Param("clientId") clientId: string, @Req() req: Request) {
    return this.clientService.getClientForTenant(clientId, req.tenantId!);
  }

  /**
   * Update OAuth Client
   * Requires: clients:write permission
   */
  @Put("clients/:clientId")
  @UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
  @RequirePermissions(Permissions.CLIENTS_WRITE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update OAuth Client (Requires: clients:write)",
    description: "Update OAuth2 client configuration",
  })
  @ApiResponse({ status: 200, description: "Client updated" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  @ApiResponse({ status: 404, description: "Client not found" })
  async updateClient(
    @Param("clientId") clientId: string,
    @Body() dto: UpdateOAuthClientDto,
    @Req() req: Request,
  ) {
    await this.clientService.updateClient(clientId, req.tenantId!, dto);
    return { message: "Client updated successfully" };
  }

  /**
   * Delete OAuth Client
   * Requires: clients:delete permission
   */
  @Delete("clients/:clientId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
  @RequirePermissions(Permissions.CLIENTS_DELETE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete OAuth Client (Requires: clients:delete)",
    description: "Delete an OAuth2 client",
  })
  @ApiResponse({ status: 204, description: "Client deleted" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  @ApiResponse({ status: 404, description: "Client not found" })
  async deleteClient(@Param("clientId") clientId: string, @Req() req: Request) {
    await this.clientService.deleteClient(clientId, req.tenantId!);
  }

  /**
   * Rotate Client Secret
   * Requires: clients:write permission
   */
  @Post("clients/:clientId/rotate-secret")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
  @RequirePermissions(Permissions.CLIENTS_WRITE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Rotate Client Secret (Requires: clients:write)",
    description: "Generate a new client secret",
  })
  @ApiResponse({ status: 200, description: "Secret rotated" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async rotateClientSecret(@Param("clientId") clientId: string, @Req() req: Request) {
    const { clientSecret } = await this.clientService.rotateClientSecret(clientId, req.tenantId!);
    return {
      message: "Client secret rotated successfully",
      clientSecret, // Only shown once!
    };
  }

  // ============================================================
  // NOTES ON PUBLIC ENDPOINTS (No RBAC protection needed)
  // ============================================================

  /*
  These endpoints remain public/unprotected:

  - GET /oauth/authorize - OAuth flow start (requires user login redirect)
  - POST /oauth/token - Token exchange (validated by client credentials)
  - GET /oauth/userinfo - Protected by Bearer token
  - POST /oauth/revoke - Token revocation
  - POST /oauth/introspect - Token introspection
  - GET /.well-known/openid-configuration - OIDC discovery
  - GET /oauth/jwks - Public keys

  These are part of the OAuth2/OIDC spec and must remain accessible
  for OAuth clients to function properly.
  */
}
