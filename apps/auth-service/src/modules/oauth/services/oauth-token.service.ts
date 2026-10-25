import { Injectable } from "@nestjs/common";
import { oauthError } from "../oauth-errors";
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
import type { StringValue } from "ms";
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
  codeChallengeMethod?: "S256";
  /** Browser session that authorised the code (ID token `sid`). */
  sessionId?: string;
  /** When the user last authenticated (ID token `auth_time`). */
  authTime?: Date;
  /** Authentication methods used (ID token `amr`). */
  amr?: string[];
  ipAddress?: string;
  userAgent?: string;
}

/** Authentication context carried from the authorize step into the ID token. */
export interface IdTokenAuthContext {
  sessionId?: string;
  authTime?: Date;
  amr?: string[];
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
  sessionId?: string; // Browser session the grant originated from
  scope?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** OIDC Core: "0" is the lowest level; these are ISO 29115 levels 1 and 2. */
const ACR_SINGLE_FACTOR = "1";
const ACR_MULTI_FACTOR = "2";

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
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    return this.jwtService.sign(payload, {
      privateKey: privateKeyPem,
      algorithm: 'RS256',
      header: { alg: 'RS256', kid },
      // Payloads already carry an absolute `exp`; jsonwebtoken rejects
      // `expiresIn` alongside it, so only set it when exp is absent.
      ...(payload.exp === undefined ? { expiresIn: expiresIn as StringValue } : {}),
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
      throw oauthError("invalid_client", "Unknown client");
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
      sessionId: data.sessionId,
      authTime: data.authTime,
      amr: data.amr?.join(" "),
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
      throw oauthError("invalid_grant", "Invalid authorization code");
    }

    // Check expiry
    if (authCode.expiresAt < new Date()) {
      throw oauthError("invalid_grant", "Authorization code expired");
    }

    // Check redirect URI matches
    if (authCode.redirectUri !== redirectUri) {
      throw oauthError("invalid_grant", "Redirect URI mismatch");
    }

    // Validate PKCE if present
    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        throw oauthError("invalid_grant", "code_verifier required for PKCE");
      }

      const isValid = await this.validatePKCE(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || "S256",
      );

      if (!isValid) {
        throw oauthError("invalid_grant", "Invalid code_verifier");
      }
    }

    // Consume atomically: only one concurrent exchange can flip used_at from NULL.
    const usedAt = new Date();
    const consumed = await this.authCodeRepository.update(
      { codeHash, usedAt: IsNull() },
      { usedAt },
    );
    if (consumed.affected !== 1) {
      throw oauthError("invalid_grant", "Invalid authorization code");
    }
    authCode.usedAt = usedAt;

    logger.info({ userId: authCode.userId }, "Consumed authorization code");

    return authCode;
  }

  /**
   * Validate PKCE code verifier
   */
  async validatePKCE(
    codeVerifier: string,
    codeChallenge: string,
    method: string,
  ): Promise<boolean> {
    // Only S256. Codes issued with "plain" before this change are rejected.
    if (method !== "S256") {
      throw oauthError("invalid_request", "Unsupported code_challenge_method");
    }
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) {
      return false;
    }

    const computed = Buffer.from(
      crypto.createHash("sha256").update(codeVerifier).digest("base64url"),
    );
    const expected = Buffer.from(codeChallenge);
    return (
      computed.length === expected.length && crypto.timingSafeEqual(computed, expected)
    );
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
      throw oauthError("invalid_client", "Unknown client");
    }

    // Generate JTI (JWT ID)
    const jti = uuidv4();
    const tokenHash = crypto.createHash("sha256").update(jti).digest("hex");

    // Calculate expiry
    const expiresAt = new Date(Date.now() + client.accessTokenTtl * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const iat = Math.floor(Date.now() / 1000);

    // Build JWT payload
    const payload: Record<string, unknown> = {
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
    let payload: Record<string, unknown>;
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      payload = this.jwtService.verify(token, {
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
        algorithms: ['RS256'],
      }) as Record<string, unknown>;
    } catch (error: unknown) {
      throw oauthError("invalid_token", "Invalid access token");
    }

    // Look up token in database (for revocation check)
    const jti = payload.jti;
    if (typeof jti !== "string" || jti.length === 0) {
      throw oauthError("invalid_token", "Access token missing jti");
    }
    const tokenHash = crypto.createHash("sha256").update(jti).digest("hex");

    const accessToken = await this.accessTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
      },
    });

    if (!accessToken) {
      throw oauthError("invalid_token", "Access token revoked or invalid");
    }

    // Check expiry
    if (accessToken.expiresAt < new Date()) {
      throw oauthError("invalid_token", "Access token expired");
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
    const payload = this.jwtService.decode(token) as Record<string, unknown> | null;

    if (!payload || !payload.jti) {
      return; // Invalid token, nothing to revoke
    }

    const jti = payload.jti;
    if (typeof jti !== "string" || jti.length === 0) {
      throw oauthError("invalid_token", "Access token missing jti");
    }
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
      throw oauthError("invalid_client", "Unknown client");
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
      sessionId: data.sessionId,
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
      where: { tokenHash },
      relations: ["client", "user"],
    });

    if (!refreshToken) {
      throw oauthError("invalid_grant", "Invalid refresh token");
    }

    // Check expiry
    if (refreshToken.expiresAt < new Date()) {
      throw oauthError("invalid_grant", "Refresh token expired");
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

      throw oauthError("invalid_grant", "Refresh token reuse detected");
    }

    // Rotation sets usedAt, so only explicitly revoked tokens reach here.
    if (refreshToken.revokedAt) {
      throw oauthError("invalid_grant", "Invalid refresh token");
    }

    return refreshToken;
  }

  /**
   * Rotate refresh token (exchange old for new)
   */
  async rotateRefreshToken(oldToken: OAuthRefreshToken): Promise<string> {
    // Mark old token as used atomically; a lost race is a replay -> revoke family.
    const now = new Date();
    const marked = await this.refreshTokenRepository.update(
      { id: oldToken.id, usedAt: IsNull() },
      { usedAt: now, revokedAt: now, revokedReason: "rotated" },
    );
    if (marked.affected !== 1) {
      logger.error({ tokenId: oldToken.id, familyId: oldToken.familyId }, "REFRESH TOKEN REUSE DETECTED (concurrent rotation)");
      await this.revokeRefreshTokenFamily(oldToken.familyId, "token_reuse_detected");
      throw oauthError("invalid_grant", "Refresh token reuse detected");
    }
    oldToken.usedAt = now;
    oldToken.revokedAt = now;
    oldToken.revokedReason = "rotated";

    // Create new token in same family
    const newToken = await this.createRefreshToken({
      tenantId: oldToken.tenantId,
      clientId: oldToken.clientId,
      userId: oldToken.userId,
      familyId: oldToken.familyId, // Same family
      parentTokenId: oldToken.id, // Track rotation chain
      sessionId: oldToken.sessionId,
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
   * Revoke every OAuth access and refresh token issued from a browser session
   * (RP-initiated logout). Tenant-scoped.
   */
  async revokeSessionTokens(
    tenantId: string,
    sessionId: string,
    reason: string = "session_ended",
  ): Promise<void> {
    const revocation = { revokedAt: new Date(), revokedReason: reason };
    await this.accessTokenRepository.update(
      { tenantId, sessionId, revokedAt: IsNull() },
      revocation,
    );
    await this.refreshTokenRepository.update(
      { tenantId, sessionId, revokedAt: IsNull() },
      revocation,
    );
    logger.info({ sessionId, reason }, "Revoked OAuth tokens for session");
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
    auth: IdTokenAuthContext = {},
  ): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + client.idTokenTtl;
    const iat = Math.floor(Date.now() / 1000);

    // Build ID token payload (OIDC standard claims)
    const payload: Record<string, unknown> = {
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

    // Authentication context (OIDC Core 2.): sid, auth_time, acr, amr.
    if (auth.sessionId) {
      payload.sid = auth.sessionId;
    }
    if (auth.authTime) {
      payload.auth_time = Math.floor(auth.authTime.getTime() / 1000);
    }
    if (auth.amr && auth.amr.length > 0) {
      payload.amr = auth.amr;
      payload.acr = auth.amr.includes("mfa") ? ACR_MULTI_FACTOR : ACR_SINGLE_FACTOR;
    }

    // Sign ID token
    const idToken = await this.signToken(payload, client.idTokenTtl, client.tenantId);

    logger.info({ userId: user.id }, "Created ID token");

    return idToken;
  }

  /**
   * Verify an `id_token_hint` for RP-initiated logout. The signature and issuer
   * must be ours, but expiry is ignored (OIDC RP-Initiated Logout 1.0 section 2).
   * Access tokens and purpose-bound tokens share our signing keys, so they are
   * refused: only a token with an `aud` and none of those markers is an ID token.
   */
  async verifyIdTokenHint(
    token: string,
  ): Promise<{ audience: string; subject: string; sessionId?: string }> {
    let payload: Record<string, unknown>;
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      payload = this.jwtService.verify(token, {
        publicKey: publicKey.export({ type: "spki", format: "pem" }) as string,
        algorithms: ["RS256"],
        ignoreExpiration: true,
        issuer: this.configService.get("JWT_ISSUER", "https://sentry.scrolloop.com"),
      }) as Record<string, unknown>;
    } catch {
      throw oauthError("invalid_request", "Invalid id_token_hint");
    }

    const aud = Array.isArray(payload["aud"]) ? payload["aud"][0] : payload["aud"];
    const isIdToken =
      typeof aud === "string" &&
      typeof payload["sub"] === "string" &&
      payload["token_type"] === undefined &&
      payload["type"] === undefined &&
      payload["purpose"] === undefined &&
      payload["mode"] === undefined;
    if (!isIdToken) {
      throw oauthError("invalid_request", "id_token_hint is not an ID token");
    }
    return {
      audience: aud,
      subject: payload["sub"] as string,
      sessionId: typeof payload["sid"] === "string" ? payload["sid"] : undefined,
    };
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
  ): Promise<Record<string, unknown>> {
    let payload: Record<string, unknown>;
    // Try as JWT first (access token)
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      payload = this.jwtService.verify(token, {
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
        algorithms: ['RS256'],
      }) as Record<string, unknown>;

      const jti = payload.jti as string;
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
