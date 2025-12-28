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

@ApiTags("OAuth2/OIDC")
@Controller("oauth")
export class OAuthController {
  constructor(
    private clientService: OAuthClientService,
    private tokenService: OAuthTokenService,
    private consentService: OAuthConsentService,
    private configService: ConfigService,
  ) {}

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
    const userId = (req.user as any)?.userId;

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

    // Extract client credentials
    let clientId = body.client_id;
    let clientSecret = body.client_secret;

    // Check for Basic Auth
    if (authHeader && authHeader.startsWith("Basic ")) {
      const base64 = authHeader.slice(6);
      const decoded = Buffer.from(base64, "base64").toString("utf-8");
      const [id, secret] = decoded.split(":");
      clientId = id as string;
      clientSecret = secret;
    }

    if (!clientId) {
      throw new BadRequestException("client_id required");
    }

    // Validate client
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
    client: any,
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
    client: any,
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
    client: any,
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
    const user = req.user as any;

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
    // TODO: Validate client credentials from Authorization header

    // Always return 200 per spec (don't leak token validity)
    try {
      if (body.token_type_hint === "refresh_token") {
        await this.tokenService.revokeRefreshToken(body.token);
      } else {
        await this.tokenService.revokeAccessToken(body.token);
      }
    } catch (error) {
      // Silently fail per spec
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
    // TODO: Validate client credentials from Authorization header

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
      "https://auth.fortknox.io",
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
  getJWKS(): JWKSResponseDto {
    // TODO: Implement actual JWKS with RSA keys
    return {
      keys: [
        {
          kty: "RSA",
          use: "sig",
          kid: "key_1",
          alg: "RS256",
          n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
          e: "AQAB",
        },
      ],
    };
  }

  // ============================================================
  // CLIENT MANAGEMENT (Admin endpoints)
  // ============================================================

  @Post("clients")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create OAuth Client",
    description: "Register a new OAuth2 client application",
  })
  @ApiBody({ type: CreateOAuthClientDto })
  @ApiResponse({
    status: 201,
    description: "Client created",
    type: CreateClientResponseDto,
  })
  async createClient(
    @Body() dto: CreateOAuthClientDto,
    @Req() req: Request,
  ): Promise<CreateClientResponseDto> {
    const tenantId = req.tenantId!;
    const userId = (req.user as any).userId;

    const { client, clientSecret } = await this.clientService.createClient({
      tenantId,
      ...dto,
      createdBy: userId,
    });

    return {
      ...client,
      clientSecret,
    } as any;
  }

  @Get("clients")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List OAuth Clients",
    description: "Get all OAuth2 clients for current tenant",
  })
  @ApiResponse({
    status: 200,
    description: "List of clients",
    type: [OAuthClientResponseDto],
  })
  async listClients(@Req() req: Request) {
    const tenantId = req.tenantId!;

    const { clients } = await this.clientService.listClients(tenantId, {
      isActive: true,
    });

    return clients;
  }

  @Get("clients/:clientId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get OAuth Client",
    description: "Get OAuth2 client details",
  })
  @ApiResponse({
    status: 200,
    description: "Client details",
    type: OAuthClientResponseDto,
  })
  async getClient(@Param("clientId") clientId: string) {
    return this.clientService.getClient(clientId);
  }
}
