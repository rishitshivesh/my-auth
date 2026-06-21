import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { OAuthRefreshToken, Tenant } from "@repo/database";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

/**
 * OAuthRefreshTokenService
 *
 * Handles refresh token storage, rotation, and reuse detection
 *
 * Security Features:
 * - Token rotation (new token on each use)
 * - Reuse detection (if old token used, revoke family)
 * - Family tracking (all tokens in rotation chain)
 * - Automatic expiration
 */
@Injectable()
export class OAuthRefreshTokenService {
  private readonly logger = new Logger(OAuthRefreshTokenService.name);

  constructor(
    @InjectRepository(OAuthRefreshToken)
    private readonly refreshTokenRepository: Repository<OAuthRefreshToken>,
  ) {}

  private async getSchemaName(tenantId: string): Promise<string> {
    const platformSlug = process.env.SENTRY_PLATFORM_SLUG ?? "sentry";
    if (!tenantId) {
      return `fk_${platformSlug}`;
    }
    const tenant = await this.refreshTokenRepository.manager.findOne(Tenant, {
      where: { id: tenantId }
    });
    const slug = tenant?.slug ?? platformSlug;
    return `fk_${slug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
  }

  /**
   * Create a new refresh token
   */
  async createRefreshToken(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    clientId?: string;
    scope?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
    expiresInDays?: number;
  }): Promise<{ token: string; entity: OAuthRefreshToken }> {
    const { expiresInDays = 30, ...rest } = params;

    // Generate random token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);

    // Generate new family
    const familyId = uuidv4();

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const schemaName = await this.getSchemaName(params.tenantId);

    // Store in database
    const query = `
      INSERT INTO "${schemaName}"."oauth_refresh_tokens" (
        "tenant_id", "user_id", "session_id", "client_id", "scope",
        "token_hash", "family_id", "expires_at", "ip_address", "user_agent", "device_id"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const rows = await this.refreshTokenRepository.manager.query(query, [
      params.tenantId,
      params.userId,
      params.sessionId,
      params.clientId || null,
      params.scope || null,
      tokenHash,
      familyId,
      expiresAt,
      params.ipAddress || null,
      params.userAgent || null,
      params.deviceId || null,
    ]);
    const rawEntity = rows[0];
    const entity = {
      id: rawEntity.id,
      tenantId: rawEntity.tenant_id,
      userId: rawEntity.user_id,
      sessionId: rawEntity.session_id,
      clientId: rawEntity.client_id,
      scope: rawEntity.scope,
      tokenHash: rawEntity.token_hash,
      familyId: rawEntity.family_id,
      expiresAt: rawEntity.expires_at ? new Date(rawEntity.expires_at) : null,
      createdAt: rawEntity.created_at ? new Date(rawEntity.created_at) : null,
    } as OAuthRefreshToken;

    this.logger.log(`Created refresh token for user ${params.userId}`, {
      tokenId: entity.id,
      familyId,
      expiresAt,
    });

    return { token, entity };
  }

  /**
   * Validate and rotate refresh token
   *
   * Returns new token and handles reuse detection
   */
  async rotateRefreshToken(params: {
    tenantId: string;
    token: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ accessTokenPayload: Record<string, unknown>; newToken: string }> {
    const { tenantId, token, ipAddress, userAgent } = params;

    // Hash incoming token
    const tokenHash = this.hashToken(token);

    const schemaName = await this.getSchemaName(tenantId);

    // Find token in database
    const rows = await this.refreshTokenRepository.manager.query(
      `SELECT t.*, u.email as "userEmail" FROM "${schemaName}"."oauth_refresh_tokens" t
       LEFT JOIN "${schemaName}"."users" u ON u.id = t.user_id
       WHERE t.tenant_id = $1 AND t.token_hash = $2 LIMIT 1`,
      [tenantId, tokenHash]
    );
    const rawToken = rows[0];

    if (!rawToken) {
      this.logger.warn("Refresh token not found", { tenantId });
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Fetch session
    const sessionRows = await this.refreshTokenRepository.manager.query(
      `SELECT id, revoked_at FROM "${schemaName}"."sessions" WHERE id = $1 LIMIT 1`,
      [rawToken.session_id]
    );
    const session = sessionRows[0];

    const storedToken = {
      id: rawToken.id,
      tenantId: rawToken.tenant_id,
      userId: rawToken.user_id,
      sessionId: rawToken.session_id,
      clientId: rawToken.client_id,
      scope: rawToken.scope,
      tokenHash: rawToken.token_hash,
      familyId: rawToken.family_id,
      parentTokenId: rawToken.parent_token_id,
      usedAt: rawToken.used_at ? new Date(rawToken.used_at) : null,
      revokedAt: rawToken.revoked_at ? new Date(rawToken.revoked_at) : null,
      revokedReason: rawToken.revoked_reason,
      expiresAt: rawToken.expires_at ? new Date(rawToken.expires_at) : null,
      session: session ? {
        id: session.id,
        revokedAt: session.revoked_at ? new Date(session.revoked_at) : null,
      } : null,
      user: {
        email: rawToken.userEmail || "",
      },
    } as any;

    // ============================================================
    // REUSE DETECTION
    // ============================================================
    if (storedToken.usedAt) {
      this.logger.error("🚨 REFRESH TOKEN REUSE DETECTED", {
        tokenId: storedToken.id,
        userId: storedToken.userId,
        familyId: storedToken.familyId,
        originalUse: storedToken.usedAt,
        newAttempt: new Date(),
      });

      // SECURITY: Revoke entire token family
      await this.revokeTokenFamily(storedToken.familyId, tenantId);

      throw new UnauthorizedException(
        "Token reuse detected. All sessions in this family have been revoked.",
      );
    }

    // ============================================================
    // VALIDATION
    // ============================================================
    if (storedToken.revokedAt) {
      this.logger.warn("Refresh token revoked", {
        tokenId: storedToken.id,
        revokedAt: storedToken.revokedAt,
        reason: storedToken.revokedReason,
      });
      throw new UnauthorizedException("Refresh token has been revoked");
    }

    if (storedToken.expiresAt < new Date()) {
      this.logger.warn("Refresh token expired", {
        tokenId: storedToken.id,
        expiresAt: storedToken.expiresAt,
      });
      throw new UnauthorizedException("Refresh token has expired");
    }

    // Check session is still valid
    if (!storedToken.session || storedToken.session.revokedAt) {
      this.logger.warn("Session revoked or not found", {
        sessionId: storedToken.sessionId,
      });
      throw new UnauthorizedException("Session no longer valid");
    }

    // ============================================================
    // ROTATION
    // ============================================================

    // Mark current token as USED
    const usedAt = new Date();
    await this.refreshTokenRepository.manager.query(
      `UPDATE "${schemaName}"."oauth_refresh_tokens" SET used_at = $1 WHERE id = $2`,
      [usedAt, storedToken.id]
    );

    this.logger.debug("Marked refresh token as used", {
      tokenId: storedToken.id,
    });

    // Generate NEW refresh token (same family)
    const newToken = crypto.randomBytes(32).toString("hex");
    const newTokenHash = this.hashToken(newToken);
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store new token
    await this.refreshTokenRepository.manager.query(
      `INSERT INTO "${schemaName}"."oauth_refresh_tokens" (
        "tenant_id", "user_id", "session_id", "client_id", "scope",
        "token_hash", "family_id", "parent_token_id", "expires_at", "ip_address", "user_agent"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        tenantId,
        storedToken.userId,
        storedToken.sessionId,
        storedToken.clientId || null,
        storedToken.scope || null,
        newTokenHash,
        storedToken.familyId,
        storedToken.id,
        newExpiresAt,
        ipAddress || null,
        userAgent || null,
      ]
    );

    this.logger.log("Rotated refresh token", {
      oldTokenId: storedToken.id,
      familyId: storedToken.familyId,
    });

    // Return payload for new access token
    const accessTokenPayload = {
      sub: storedToken.userId,
      email: storedToken.user.email,
      tenantId: storedToken.tenantId,
      sessionId: storedToken.sessionId,
      scope: storedToken.scope,
    };

    return {
      accessTokenPayload,
      newToken,
    };
  }

  /**
   * Revoke a single refresh token
   */
  async revokeToken(
    tokenHash: string,
    tenantId: string,
    reason: string = "manual_revocation",
  ): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    await this.refreshTokenRepository.manager.query(
      `UPDATE "${schemaName}"."oauth_refresh_tokens"
       SET revoked_at = $1, revoked_reason = $2
       WHERE token_hash = $3 AND tenant_id = $4`,
      [new Date(), reason, tokenHash, tenantId]
    );

    this.logger.log("Revoked refresh token", { tokenHash, reason });
  }

  /**
   * Revoke entire token family (for reuse detection)
   */
  async revokeTokenFamily(familyId: string, tenantId: string): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    const result = await this.refreshTokenRepository.manager.query(
      `UPDATE "${schemaName}"."oauth_refresh_tokens"
       SET revoked_at = $1, revoked_reason = $2
       WHERE family_id = $3 AND tenant_id = $4`,
      [new Date(), "family_revoked_reuse_detection", familyId, tenantId]
    );

    this.logger.warn("🔥 Revoked entire token family", {
      familyId,
      tenantId,
      tokensRevoked: result[1] || 0,
    });
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(
    userId: string,
    tenantId: string,
    reason: string = "user_logout_all",
  ): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    await this.refreshTokenRepository.manager.query(
      `UPDATE "${schemaName}"."oauth_refresh_tokens"
       SET revoked_at = $1, revoked_reason = $2
       WHERE user_id = $3 AND tenant_id = $4 AND revoked_at IS NULL`,
      [new Date(), reason, userId, tenantId]
    );

    this.logger.log("Revoked all user tokens", {
      userId,
      tenantId,
    });
  }

  /**
   * Revoke all tokens for a session
   */
  async revokeSessionTokens(
    sessionId: string,
    tenantId: string,
    reason: string = "session_logout",
  ): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    await this.refreshTokenRepository.manager.query(
      `UPDATE "${schemaName}"."oauth_refresh_tokens"
       SET revoked_at = $1, revoked_reason = $2
       WHERE session_id = $3 AND tenant_id = $4 AND revoked_at IS NULL`,
      [new Date(), reason, sessionId, tenantId]
    );

    this.logger.log("Revoked session tokens", {
      sessionId,
      tenantId,
    });
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(
    userId: string,
    tenantId: string,
  ): Promise<OAuthRefreshToken[]> {
    const schemaName = await this.getSchemaName(tenantId);
    const rows = await this.refreshTokenRepository.manager.query(
      `SELECT * FROM "${schemaName}"."oauth_refresh_tokens"
       WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [userId, tenantId]
    );
    return rows.map((raw: any) => ({
      id: raw.id,
      tenantId: raw.tenant_id,
      userId: raw.user_id,
      sessionId: raw.session_id,
      clientId: raw.client_id,
      scope: raw.scope,
      tokenHash: raw.token_hash,
      familyId: raw.family_id,
      parentTokenId: raw.parent_token_id,
      expiresAt: raw.expires_at ? new Date(raw.expires_at) : null,
      createdAt: raw.created_at ? new Date(raw.created_at) : null,
    })) as OAuthRefreshToken[];
  }

  /**
   * Clean up expired tokens (run as cron job)
   */
  async cleanupExpiredTokens(tenantId?: string): Promise<number> {
    if (tenantId) {
      const schemaName = await this.getSchemaName(tenantId);
      const result = await this.refreshTokenRepository.manager.query(
        `DELETE FROM "${schemaName}"."oauth_refresh_tokens" WHERE expires_at < $1 AND tenant_id = $2`,
        [new Date(), tenantId]
      );
      return result[1] || 0;
    }
    return 0;
  }

  /**
   * Hash a token using SHA-256
   */
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
