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
  UnauthorizedException,
  BadRequestException,
  Headers,
  Delete,
  Put,
} from "@nestjs/common";
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
import { JwksService } from "./services/jwks.service";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { logger } from "@/common/logger";

interface OAuthClient {
  id: string;
  clientType: string;
  requirePkce: boolean;
  accessTokenTtl: number;
  [key: string]: unknown;
}

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
    if (authHeader && authHeader.startsWith("Basic ")) {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString(
        "utf-8",
      );
      const [id, secret] = decoded.split(":");
      return { clientId: id, clientSecret: secret };
    }
    return { clientId: bodyClientId, clientSecret: bodyClientSecret };
  }

  // ============================================================
  // AUTHORIZATION ENDPOINT
  // ============================================================

  @Get("authorize")
  @ApiOperation({
    summary: "OAuth2 Authorization Endpoint",
    description:
      "Initiate OAuth2 authorization code flow. User must be logged in.",
  })
  @ApiQuery({ name: "client_id", required: true })
  @ApiQuery({ name: "redirect_uri", required: true })
  @ApiQuery({ name: "response_type", required: true, enum: ["code"] })
  @ApiQuery({ name: "scope", required: true })
  @ApiQuery({ name: "state", required: false })
  @ApiQuery({ name: "nonce", required: false })
  @ApiQuery({ name: "code_challenge", required: false })
  @ApiQuery({
    name: "code_challenge_method",
    required: false,
    enum: ["S256", "plain"],
  })
  @ApiResponse({
    status: 302,
    description: "Redirects to redirect_uri with code and state",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request parameters",
  })
  async authorize(
    @Query() query: AuthorizeRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenantId = req.tenantId!;

    // TODO: Check if user is logged in
    // For now, assume user is authenticated and we have userId
    const userId = (req.user as JwtUser)?.userId;

    if (!userId) {
      // Redirect to login with return URL
      const loginUrl = `/auth/login?return_url=${encodeURIComponent(req.url)}`;
      return res.redirect(loginUrl);
    }

    // Validate client
    const client = await this.clientService.getClient(query.client_id);

    // Validate redirect URI
    await this.clientService.validateRedirectUri(client, query.redirect_uri);

    // Validate grant type
    await this.clientService.validateGrantType(client, "authorization_code");

    // Parse scopes
    const requestedScopes = query.scope.split(" ");

    // Validate scopes
    const grantedScopes = await this.clientService.validateScopes(
      client,
      requestedScopes,
    );

    // Check PKCE requirement
    if (client.requirePkce && !query.code_challenge) {
      throw new BadRequestException("code_challenge required for this client");
    }

    // Check if consent is required
    const existingConsent = await this.consentService.getConsent(
      tenantId,
      userId,
      client.id,
    );

    const requireConsent = await this.consentService.isConsentRequired(
      client,
      existingConsent ?? undefined,
    );

    if (requireConsent) {
      // TODO: Show consent screen
      // For now, auto-grant consent
      await this.consentService.grantConsent({
        tenantId,
        clientId: client.id,
        userId,
        grantedScopes,
        rememberConsent: false,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    // Generate authorization code
    const code = await this.tokenService.createAuthorizationCode({
      tenantId,
      clientId: client.id,
      userId,
      redirectUri: query.redirect_uri,
      scope: grantedScopes.join(" "),
      state: query.state,
      nonce: query.nonce,
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    // Build redirect URL
    const redirectUrl = new URL(query.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (query.state) {
      redirectUrl.searchParams.set("state", query.state);
    }

    // Redirect to client
    return res.redirect(redirectUrl.toString());
  }

  // ============================================================
  // TOKEN ENDPOINT
  // ============================================================

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
      throw new BadRequestException("client_id required");
    }

    const client = await this.clientService.validateClient(
      clientId,
      clientSecret,
    );

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
        throw new BadRequestException("unsupported_grant_type");
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
      throw new BadRequestException("code required");
    }

    if (!body.redirect_uri) {
      throw new BadRequestException("redirect_uri required");
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
      throw new BadRequestException("refresh_token required");
    }

    // Validate refresh token
    const refreshToken = await this.tokenService.validateRefreshToken(
      body.refresh_token,
    );

    // Verify client matches
    if (refreshToken.clientId !== client.id) {
      throw new UnauthorizedException("client_mismatch");
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
      throw new BadRequestException(
        "client_credentials requires confidential client",
      );
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

    return {
      sub: user.userId,
      email: user.email,
      email_verified: true, // TODO: Get from user entity
      name: user.name,
      given_name: user.given_name,
      family_name: user.family_name,
      picture: user.picture,
      updated_at: Math.floor(Date.now() / 1000),
    };
  }

  // ============================================================
  // REVOKE ENDPOINT
  // ============================================================

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
        throw new UnauthorizedException("Invalid client credentials");
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
      throw new UnauthorizedException("Client authentication required");
    }
    await this.clientService.validateClient(clientId, clientSecret);

    return this.tokenService.introspectToken(body.token, body.token_type_hint);
  }

  // ============================================================
  // DISCOVERY ENDPOINTS
  // ============================================================

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
    const baseUrl = this.configService.get(
      "BASE_URL",
      "https://sentry.scrolloop.com",
    );

    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
      jwks_uri: `${baseUrl}/oauth/jwks`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      introspection_endpoint: `${baseUrl}/oauth/introspect`,
      response_types_supported: ["code"],
      grant_types_supported: [
        "authorization_code",
        "refresh_token",
        "client_credentials",
      ],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: [
        "openid",
        "profile",
        "email",
        "phone",
        "address",
        "offline_access",
      ],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
      code_challenge_methods_supported: ["S256", "plain"],
      claims_supported: [
        "sub",
        "email",
        "email_verified",
        "name",
        "given_name",
        "family_name",
        "picture",
      ],
    };
  }

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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("clients:write")
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
      tenantId,
      ...dto,
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("clients:read")
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("clients:read")
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
  async getClient(@Param("clientId") clientId: string) {
    return this.clientService.getClient(clientId);
  }

  /**
   * Update OAuth Client
   * Requires: clients:write permission
   */
  @Put("clients/:clientId")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("clients:write")
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
    const tenantId = req.tenantId!;
    // TODO: Implement updateClient in service
    return { message: "Client updated successfully" };
  }

  /**
   * Delete OAuth Client
   * Requires: clients:delete permission
   */
  @Delete("clients/:clientId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("clients:delete")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete OAuth Client (Requires: clients:delete)",
    description: "Delete an OAuth2 client",
  })
  @ApiResponse({ status: 204, description: "Client deleted" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  @ApiResponse({ status: 404, description: "Client not found" })
  async deleteClient(@Param("clientId") clientId: string) {
    // TODO: Implement deleteClient in service
    return;
  }

  /**
   * Rotate Client Secret
   * Requires: clients:write permission
   */
  @Post("clients/:clientId/rotate-secret")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("clients:write")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Rotate Client Secret (Requires: clients:write)",
    description: "Generate a new client secret",
  })
  @ApiResponse({ status: 200, description: "Secret rotated" })
  @ApiResponse({ status: 403, description: "Forbidden - missing permissions" })
  async rotateClientSecret(@Param("clientId") clientId: string) {
    const newSecret = await this.clientService.rotateClientSecret(clientId);
    return {
      message: "Client secret rotated successfully",
      clientSecret: newSecret, // Only shown once!
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
