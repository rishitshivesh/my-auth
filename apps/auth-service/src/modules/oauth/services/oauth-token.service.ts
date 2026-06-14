import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { logger } from "@/common/logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, LessThan } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OAuthAuthorizationCode,
  OAuthAccessToken,
  OAuthRefreshToken,
  OAuthClient,
  User,
} from "@repo/database";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { JwksService } from "./jwks.service";

export interface CreateAuthorizationCodeDto {
  tenantId: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256" | "plain";
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateAccessTokenDto {
  tenantId: string;
  clientId: string;
  userId?: string; // NULL for client_credentials
  sessionId?: string;
  scope?: string;
  audience?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateRefreshTokenDto {
  tenantId: string;
  clientId: string;
  userId: string;
  accessTokenId?: string;
  familyId?: string; // For rotation
  parentTokenId?: string; // For rotation
  scope?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class OAuthTokenService {
  constructor(
    @InjectRepository(OAuthAuthorizationCode)
    private authCodeRepository: Repository<OAuthAuthorizationCode>,
    @InjectRepository(OAuthAccessToken)
    private accessTokenRepository: Repository<OAuthAccessToken>,
    @InjectRepository(OAuthRefreshToken)
    private refreshTokenRepository: Repository<OAuthRefreshToken>,
    @InjectRepository(OAuthClient)
    private clientRepository: Repository<OAuthClient>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly jwksService: JwksService,
  ) {}

  private async signToken(payload: Record<string, unknown>, expiresIn: string | number, tenantId?: string): Promise<string> {
    const { kid, privateKey } = await this.jwksService.getCurrentSigningKey(tenantId);
    return this.jwtService.sign(payload, {
      privateKey: privateKey as any,
      algorithm: 'RS256',
      header: { alg: 'RS256', kid },
      expiresIn: expiresIn as any,
    });
  }

  // ============================================================
  // AUTHORIZATION CODES
  // ============================================================

  /**
   * Create authorization code
   * Returns plaintext code (opaque, random string)
   */
  async createAuthorizationCode(
    data: CreateAuthorizationCodeDto,
  ): Promise<string> {
    const client = await this.clientRepository.findOne({
      where: { id: data.clientId },
    });

    if (!client) {
      throw new BadRequestException("Invalid client");
    }

    // Generate random code
    const code = crypto.randomBytes(32).toString("base64url");
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    // Calculate expiry
    const expiresAt = new Date(Date.now() + client.authorizationCodeTtl * 1000);

    // Save code
    await this.authCodeRepository.save({
      tenantId: data.tenantId,
      clientId: data.clientId,
      userId: data.userId,
      codeHash,
      redirectUri: data.redirectUri,
      scope: data.scope,
      state: data.state,
      nonce: data.nonce,
      codeChallenge: data.codeChallenge,
      codeChallengeMethod: data.codeChallengeMethod,
      expiresAt,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    logger.info({ userId: data.userId }, "Created authorization code");

    return code; // Return plaintext code
  }

  /**
   * Validate and consume authorization code
   */
  async validateAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<OAuthAuthorizationCode> {
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    const authCode = await this.authCodeRepository.findOne({
      where: {
        codeHash,
        clientId,
        usedAt: IsNull(),
      },
      relations: ["client", "user"],
    });

    if (!authCode) {
      throw new UnauthorizedException("Invalid authorization code");
    }

    // Check expiry
    if (authCode.expiresAt < new Date()) {
      throw new UnauthorizedException("Authorization code expired");
    }

    // Check redirect URI matches
    if (authCode.redirectUri !== redirectUri) {
      throw new UnauthorizedException("Redirect URI mismatch");
    }

    // Validate PKCE if present
    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        throw new UnauthorizedException("code_verifier required for PKCE");
      }

      const isValid = await this.validatePKCE(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || "S256",
      );

      if (!isValid) {
        throw new UnauthorizedException("Invalid code_verifier");
      }
    }

    // Mark as used
    authCode.usedAt = new Date();
    await this.authCodeRepository.save(authCode);

    logger.info({ userId: authCode.userId }, "Consumed authorization code");

    return authCode;
  }

  /**
   * Validate PKCE code verifier
   */
  async validatePKCE(
    codeVerifier: string,
    codeChallenge: string,
    method: "S256" | "plain",
  ): Promise<boolean> {
    let computedChallenge: string;

    if (method === "S256") {
      computedChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");
    } else if (method === "plain") {
      computedChallenge = codeVerifier;
    } else {
      throw new BadRequestException("Invalid code_challenge_method");
    }

    return computedChallenge === codeChallenge;
  }

  // ============================================================
  // ACCESS TOKENS
  // ============================================================

  /**
   * Create access token (JWT)
   */
  async createAccessToken(
    data: CreateAccessTokenDto,
    user?: User,
  ): Promise<string> {
    const client = await this.clientRepository.findOne({
      where: { id: data.clientId },
    });

    if (!client) {
      throw new BadRequestException("Invalid client");
    }

    // Generate JTI (JWT ID)
    const jti = uuidv4();
    const tokenHash = crypto.createHash("sha256").update(jti).digest("hex");

    // Calculate expiry
    const expiresAt = new Date(Date.now() + client.accessTokenTtl * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const iat = Math.floor(Date.now() / 1000);

    // Build JWT payload
    const payload: any = {
      iss: this.configService.get("JWT_ISSUER", "https://sentry.scrolloop.com"),
      sub: data.userId || data.clientId, // User ID or client ID for M2M
      aud: data.audience || data.clientId,
      exp,
      iat,
      jti,
      client_id: client.clientId,
      tenant_id: data.tenantId,
      token_type: "access_token",
    };

    // Add scope if present
    if (data.scope) {
      payload.scope = data.scope;
    }

    // Add session ID if present
    if (data.sessionId) {
      payload.session_id = data.sessionId;
    }

    // Add user claims for user tokens
    if (user) {
      payload.email = user.email;
      payload.email_verified = user.emailVerified;
    }

    // Sign JWT
    const accessToken = await this.signToken(payload, client.accessTokenTtl, data.tenantId);

    // Store token record (for revocation tracking)
    await this.accessTokenRepository.save({
      tenantId: data.tenantId,
      clientId: data.clientId,
      userId: data.userId,
      sessionId: data.sessionId,
      tokenHash,
      scope: data.scope,
      audience: data.audience,
      expiresAt,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    logger.info({ userId: data.userId || "M2M" }, "Created access token");

    return accessToken;
  }

  /**
   * Validate access token
   */
  async validateAccessToken(token: string): Promise<OAuthAccessToken> {
    // Verify JWT signature (RS256)
    let payload: any;
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      payload = this.jwtService.verify(token, {
        publicKey: publicKey as any,
        algorithms: ['RS256'],
      });
    } catch (error) {
      throw new UnauthorizedException("Invalid access token");
    }

    // Look up token in database (for revocation check)
    const jti = payload.jti;
    const tokenHash = crypto.createHash("sha256").update(jti).digest("hex");

    const accessToken = await this.accessTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
      },
    });

    if (!accessToken) {
      throw new UnauthorizedException("Access token revoked or invalid");
    }

    // Check expiry
    if (accessToken.expiresAt < new Date()) {
      throw new UnauthorizedException("Access token expired");
    }

    // Update last used
    accessToken.lastUsedAt = new Date();
    accessToken.useCount += 1;
    await this.accessTokenRepository.save(accessToken);

    return accessToken;
  }

  /**
   * Revoke access token
   */
  async revokeAccessToken(
    token: string,
    reason: string = "user_revoked",
  ): Promise<void> {
    // Decode without verifying (to get JTI)
    const payload = this.jwtService.decode(token) as any;

    if (!payload || !payload.jti) {
      return; // Invalid token, nothing to revoke
    }

    const jti = payload.jti;
    const tokenHash = crypto.createHash("sha256").update(jti).digest("hex");

    await this.accessTokenRepository.update(
      { tokenHash },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    logger.info({ reason }, "Revoked access token");
  }

  // ============================================================
  // REFRESH TOKENS
  // ============================================================

  /**
   * Create refresh token (opaque)
   */
  async createRefreshToken(data: CreateRefreshTokenDto): Promise<string> {
    const client = await this.clientRepository.findOne({
      where: { id: data.clientId },
    });

    if (!client) {
      throw new BadRequestException("Invalid client");
    }

    // Generate random token
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Generate family ID if not provided (new family)
    const familyId = data.familyId || uuidv4();

    // Calculate expiry
    const expiresAt = new Date(Date.now() + client.refreshTokenTtl * 1000);

    // Save token
    await this.refreshTokenRepository.save({
      tenantId: data.tenantId,
      clientId: data.clientId,
      userId: data.userId,
      accessTokenId: data.accessTokenId,
      tokenHash,
      familyId,
      parentTokenId: data.parentTokenId,
      scope: data.scope,
      expiresAt,
      deviceId: data.deviceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    logger.info({ userId: data.userId }, "Created refresh token");

    return token; // Return plaintext token
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(token: string): Promise<OAuthRefreshToken> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const refreshToken = await this.refreshTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
      },
      relations: ["client", "user"],
    });

    if (!refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Check expiry
    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    // REUSE DETECTION
    if (refreshToken.usedAt) {
      // Token already used! Security breach!
      logger.error({ tokenId: refreshToken.id, familyId: refreshToken.familyId, userId: refreshToken.userId }, "REFRESH TOKEN REUSE DETECTED");

      // Revoke entire family
      await this.revokeRefreshTokenFamily(
        refreshToken.familyId,
        "token_reuse_detected",
      );

      throw new UnauthorizedException(
        "Token reuse detected - all sessions revoked",
      );
    }

    return refreshToken;
  }

  /**
   * Rotate refresh token (exchange old for new)
   */
  async rotateRefreshToken(oldToken: OAuthRefreshToken): Promise<string> {
    // Mark old token as used
    oldToken.usedAt = new Date();
    oldToken.revokedAt = new Date();
    oldToken.revokedReason = "rotated";
    await this.refreshTokenRepository.save(oldToken);

    // Create new token in same family
    const newToken = await this.createRefreshToken({
      tenantId: oldToken.tenantId,
      clientId: oldToken.clientId,
      userId: oldToken.userId,
      familyId: oldToken.familyId, // Same family
      parentTokenId: oldToken.id, // Track rotation chain
      scope: oldToken.scope,
      deviceId: oldToken.deviceId,
      ipAddress: oldToken.ipAddress,
      userAgent: oldToken.userAgent,
    });

    logger.info({ userId: oldToken.userId }, "Rotated refresh token");

    return newToken;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(
    token: string,
    reason: string = "user_revoked",
  ): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await this.refreshTokenRepository.update(
      { tokenHash },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    logger.info({ reason }, "Revoked refresh token");
  }

  /**
   * Revoke entire refresh token family (reuse detection)
   */
  async revokeRefreshTokenFamily(
    familyId: string,
    reason: string = "token_reuse_detected",
  ): Promise<void> {
    await this.refreshTokenRepository.update(
      {
        familyId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    logger.warn({ familyId, reason }, "Revoked token family");
  }

  /**
   * Revoke all refresh tokens for user
   */
  async revokeAllUserRefreshTokens(
    userId: string,
    tenantId: string,
    reason: string = "logout_all",
  ): Promise<void> {
    await this.refreshTokenRepository.update(
      {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    logger.info({ userId, reason }, "Revoked all refresh tokens for user");
  }

  /**
   * Revoke all tokens for client
   */
  async revokeAllClientTokens(
    clientId: string,
    tenantId: string,
  ): Promise<void> {
    // Revoke access tokens
    await this.accessTokenRepository.update(
      {
        clientId,
        tenantId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: "client_revoked",
      },
    );

    // Revoke refresh tokens
    await this.refreshTokenRepository.update(
      {
        clientId,
        tenantId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: "client_revoked",
      },
    );

    logger.info({ clientId, tenantId }, "Revoked all tokens for client");
  }

  // ============================================================
  // ID TOKENS (OIDC)
  // ============================================================

  /**
   * Create ID token (JWT with user claims)
   */
  async createIDToken(
    user: User,
    client: OAuthClient,
    nonce?: string,
  ): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + client.idTokenTtl;
    const iat = Math.floor(Date.now() / 1000);

    // Build ID token payload (OIDC standard claims)
    const payload: any = {
      iss: this.configService.get("JWT_ISSUER", "https://sentry.scrolloop.com"),
      sub: user.id,
      aud: client.clientId,
      exp,
      iat,

      // Standard OIDC claims
      email: user.email,
      email_verified: user.emailVerified,
      name: `${user.firstName} ${user.lastName}`.trim(),
      given_name: user.firstName,
      family_name: user.lastName,

      // Include nonce for replay protection
      nonce,
    };

    // Add optional claims
    if (user.avatarUrl) {
      payload.picture = user.avatarUrl;
    }

    // Sign ID token
    const idToken = await this.signToken(payload, client.idTokenTtl, client.tenantId);

    logger.info({ userId: user.id }, "Created ID token");

    return idToken;
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();

    // Delete expired authorization codes (older than 1 day)
    const oldCodeDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const deletedCodes = await this.authCodeRepository.delete({
      expiresAt: LessThan(oldCodeDate),
    });

    // Delete expired access tokens (older than 1 day)
    const deletedAccessTokens = await this.accessTokenRepository.delete({
      expiresAt: LessThan(oldCodeDate),
    });

    // Delete expired refresh tokens (older than 30 days)
    const oldRefreshDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deletedRefreshTokens = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(oldRefreshDate),
    });

    logger.info({ codes: deletedCodes.affected || 0, accessTokens: deletedAccessTokens.affected || 0, refreshTokens: deletedRefreshTokens.affected || 0 }, "Cleaned up expired tokens");
  }

  // ============================================================
  // INTROSPECTION
  // ============================================================

  /**
   * Introspect token (get metadata)
   */
  async introspectToken(
    token: string,
    tokenTypeHint?: "access_token" | "refresh_token",
  ): Promise<any> {
    let payload: any;
    // Try as JWT first (access token)
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      payload = this.jwtService.verify(token, {
        publicKey: publicKey as any,
        algorithms: ['RS256'],
      });

      const jti = payload.jti;
      const tokenHash = crypto.createHash("sha256").update(jti).digest("hex");

      const accessToken = await this.accessTokenRepository.findOne({
        where: { tokenHash },
      });

      if (!accessToken || accessToken.revokedAt) {
        return { active: false };
      }

      return {
        active: true,
        scope: accessToken.scope,
        client_id: payload.client_id,
        username: payload.email,
        token_type: "Bearer",
        exp: payload.exp,
        iat: payload.iat,
        sub: payload.sub,
        aud: payload.aud,
      };
    } catch {
      // Not a JWT, try as refresh token
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const refreshToken = await this.refreshTokenRepository.findOne({
        where: { tokenHash },
        relations: ["client", "user"],
      });

      if (
        !refreshToken ||
        refreshToken.revokedAt ||
        refreshToken.expiresAt < new Date()
      ) {
        return { active: false };
      }

      return {
        active: true,
        scope: refreshToken.scope,
        client_id: refreshToken.client.clientId,
        username: refreshToken.user.email,
        token_type: "refresh_token",
        exp: Math.floor(refreshToken.expiresAt.getTime() / 1000),
        sub: refreshToken.userId,
      };
    }
  }
}
