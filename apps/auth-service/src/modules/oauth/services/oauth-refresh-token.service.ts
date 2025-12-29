import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { OAuthRefreshToken } from "@repo/database";
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

    // Store in database
    const entity = await this.refreshTokenRepository.save({
      ...rest,
      tokenHash,
      familyId,
      expiresAt,
    });

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
  }): Promise<{ accessTokenPayload: any; newToken: string }> {
    const { tenantId, token, ipAddress, userAgent } = params;

    // Hash incoming token
    const tokenHash = this.hashToken(token);

    // Find token in database
    const storedToken = await this.refreshTokenRepository.findOne({
      where: {
        tenantId,
        tokenHash,
      },
      relations: ["user", "session"],
    });

    if (!storedToken) {
      this.logger.warn("Refresh token not found", { tenantId });
      throw new UnauthorizedException("Invalid refresh token");
    }

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
    storedToken.usedAt = new Date();
    await this.refreshTokenRepository.save(storedToken);

    this.logger.debug("Marked refresh token as used", {
      tokenId: storedToken.id,
    });

    // Generate NEW refresh token (same family)
    const newToken = crypto.randomBytes(32).toString("hex");
    const newTokenHash = this.hashToken(newToken);

    // Store new token
    const newRefreshToken = await this.refreshTokenRepository.save({
      tenantId,
      userId: storedToken.userId,
      sessionId: storedToken.sessionId,
      clientId: storedToken.clientId,
      scope: storedToken.scope,
      tokenHash: newTokenHash,
      familyId: storedToken.familyId, // SAME family
      parentTokenId: storedToken.id, // Link to parent
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ipAddress,
      userAgent,
    });

    this.logger.log("Rotated refresh token", {
      oldTokenId: storedToken.id,
      newTokenId: newRefreshToken.id,
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
    await this.refreshTokenRepository.update(
      { tokenHash, tenantId },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    this.logger.log("Revoked refresh token", { tokenHash, reason });
  }

  /**
   * Revoke entire token family (for reuse detection)
   */
  async revokeTokenFamily(familyId: string, tenantId: string): Promise<void> {
    const result = await this.refreshTokenRepository.update(
      { familyId, tenantId },
      {
        revokedAt: new Date(),
        revokedReason: "family_revoked_reuse_detection",
      },
    );

    this.logger.warn("🔥 Revoked entire token family", {
      familyId,
      tenantId,
      tokensRevoked: result.affected,
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
    const result = await this.refreshTokenRepository.update(
      { userId, tenantId, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    this.logger.log("Revoked all user tokens", {
      userId,
      tenantId,
      tokensRevoked: result.affected,
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
    const result = await this.refreshTokenRepository.update(
      { sessionId, tenantId, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    this.logger.log("Revoked session tokens", {
      sessionId,
      tenantId,
      tokensRevoked: result.affected,
    });
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(
    userId: string,
    tenantId: string,
  ): Promise<OAuthRefreshToken[]> {
    return this.refreshTokenRepository.find({
      where: {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
      order: {
        createdAt: "DESC",
      },
    });
  }

  /**
   * Clean up expired tokens (run as cron job)
   */
  async cleanupExpiredTokens(tenantId?: string): Promise<number> {
    const query = this.refreshTokenRepository.createQueryBuilder("token");

    query.where("token.expiresAt < :now", { now: new Date() });

    if (tenantId) {
      query.andWhere("token.tenantId = :tenantId", { tenantId });
    }

    const result = await query.delete().execute();

    this.logger.log("Cleaned up expired tokens", {
      tenantId,
      tokensDeleted: result.affected,
    });

    return result.affected || 0;
  }

  /**
   * Hash a token using SHA-256
   */
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
