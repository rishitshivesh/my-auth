import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, LessThan, In } from "typeorm";
import { Session, OAuthRefreshToken } from "@repo/database";
import { SessionRepository } from "@/core/database/session.repository";
import * as geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

export interface ActiveSessionDto {
  id: string;
  deviceInfo: {
    browser?: string;
    os?: string;
    device?: string;
    type?: string; // mobile, tablet, desktop
  };
  location?: {
    city?: string;
    country?: string;
    timezone?: string;
  };
  ipAddress?: string;
  lastActivity: Date;
  createdAt: Date;
  isCurrent: boolean; // Is this the current session?
  tokenFamily: {
    familyId: string;
    tokensInFamily: number;
    lastUsed: Date;
  };
}

/**
 * SessionManagementService
 *
 * Manages user sessions:
 * - List active sessions
 * - Revoke individual sessions
 * - Logout all devices
 * - Session analytics
 */
@Injectable()
export class SessionManagementService {
  private readonly logger = new Logger(SessionManagementService.name);

  constructor(
    private readonly sessionRepository: SessionRepository,
    @InjectRepository(OAuthRefreshToken)
    private readonly refreshTokenRepository: Repository<OAuthRefreshToken>,
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
  ) {}

  /**
   * Get all active sessions for a user
   *
   * Shows:
   * - Device information (browser, OS)
   * - Location (from IP)
   * - Last activity
   * - Current session indicator
   */
  async getActiveSessions(
    userId: string,
    tenantId: string,
    currentSessionId?: string,
  ): Promise<ActiveSessionDto[]> {
    // Get all active sessions
    const sessions = await this.sessionRepository.find({
      where: {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
      order: {
        lastActivity: "DESC",
      },
    });

    // Get token families for each session
    const activeSessions: ActiveSessionDto[] = [];

    for (const session of sessions) {
      // Get refresh tokens for this session
      const tokens = await this.refreshTokenRepository.find({
        where: {
          sessionId: session.id,
          tenantId,
          revokedAt: IsNull(),
        },
        order: {
          createdAt: "DESC",
        },
      });

      if (tokens.length === 0) {
        // Session has no active tokens, skip
        continue;
      }

      // Get family info
      const familyId = tokens?.[0]?.familyId!;
      const lastUsed = tokens?.[0]?.createdAt!;

      // Parse device info
      const deviceInfo = this.parseUserAgent(session.userAgent);

      // Get location from IP
      const location = this.getLocationFromIP(session.ipAddress);

      activeSessions.push({
        id: session.id,
        deviceInfo,
        location,
        ipAddress: session.ipAddress,
        lastActivity: session.lastActivity,
        createdAt: session.createdAt,
        isCurrent: session.id === currentSessionId,
        tokenFamily: {
          familyId,
          tokensInFamily: tokens.length,
          lastUsed,
        },
      });
    }

    return activeSessions;
  }

  /**
   * Get active session count for a user
   */
  async getActiveSessionCount(
    userId: string,
    tenantId: string,
  ): Promise<number> {
    const count = await this.sessionRepository.count({
      where: {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
    });

    return count;
  }

  /**
   * Revoke a specific session
   *
   * Also revokes all refresh tokens for that session
   */
  async revokeSession(
    sessionId: string,
    userId: string,
    tenantId: string,
    reason: string = "user_revoked",
  ): Promise<void> {
    // Verify session belongs to user
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        userId,
        tenantId,
      },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    if (session.revokedAt) {
      // Already revoked
      return;
    }

    // Revoke session
    await this.sessionRepository.update(
      { id: sessionId },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    // Revoke all refresh tokens for this session
    await this.oauthRefreshTokenService.revokeSessionTokens(
      sessionId,
      tenantId,
      reason,
    );

    this.logger.log("Session revoked", {
      sessionId,
      userId,
      tenantId,
      reason,
    });
  }

  /**
   * Revoke all sessions except current one
   *
   * "Logout all other devices"
   */
  async revokeAllOtherSessions(
    userId: string,
    tenantId: string,
    currentSessionId: string,
  ): Promise<number> {
    // Get all sessions except current
    const sessions = await this.sessionRepository.find({
      where: {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
    });

    let revokedCount = 0;

    for (const session of sessions) {
      if (session.id !== currentSessionId) {
        await this.revokeSession(
          session.id,
          userId,
          tenantId,
          "user_logout_other_devices",
        );
        revokedCount++;
      }
    }

    this.logger.log("Revoked all other sessions", {
      userId,
      tenantId,
      revokedCount,
      keptSession: currentSessionId,
    });

    return revokedCount;
  }

  /**
   * Revoke all sessions for a user
   *
   * "Logout all devices"
   */
  async revokeAllUserSessions(
    userId: string,
    tenantId: string,
    reason: string = "user_logout_all",
  ): Promise<number> {
    // Revoke all sessions
    const result = await this.sessionRepository.update(
      {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: reason,
        refreshTokenHash: null as unknown as string,
      },
    );

    // Revoke all refresh tokens
    await this.oauthRefreshTokenService.revokeAllUserTokens(
      userId,
      tenantId,
      reason,
    );

    const revokedCount = result.affected || 0;

    this.logger.log("Revoked all user sessions", {
      userId,
      tenantId,
      revokedCount,
      reason,
    });

    return revokedCount;
  }

  /**
   * Get session analytics for a user
   */
  async getSessionAnalytics(
    userId: string,
    tenantId: string,
  ): Promise<{
    totalSessions: number;
    activeSessions: number;
    revokedSessions: number;
    deviceBreakdown: Record<string, number>;
    locationBreakdown: Record<string, number>;
    lastActivity: Date | null;
  }> {
    const allSessions = await this.sessionRepository.find({
      where: { userId, tenantId },
    });

    const activeSessions = allSessions.filter((s) => !s.revokedAt);
    const revokedSessions = allSessions.filter((s) => s.revokedAt);

    // Device breakdown
    const deviceBreakdown: Record<string, number> = {};
    for (const session of activeSessions) {
      const device = this.parseUserAgent(session.userAgent);
      const key = device.os || "Unknown";
      deviceBreakdown[key] = (deviceBreakdown[key] || 0) + 1;
    }

    // Location breakdown
    const locationBreakdown: Record<string, number> = {};
    for (const session of activeSessions) {
      const location = this.getLocationFromIP(session.ipAddress);
      const key = location?.country || "Unknown";
      locationBreakdown[key] = (locationBreakdown[key] || 0) + 1;
    }

    // Last activity
    const lastActivity =
      activeSessions.length > 0
        ? activeSessions.reduce((latest, session) => {
            return session.lastActivity > (latest as Date)
              ? session.lastActivity
              : latest;
          }, activeSessions?.[0]?.lastActivity)
        : null;

    return {
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
      revokedSessions: revokedSessions.length,
      deviceBreakdown,
      locationBreakdown,
      lastActivity: lastActivity!,
    };
  }

  /**
   * Cleanup expired sessions
   *
   * Soft-deletes sessions that have passed their expiry date and haven't
   * been revoked yet, and revokes their associated refresh tokens.
   */
  async cleanupExpiredSessions(): Promise<{
    sessionsCleanedUp: number;
    tokensRevoked: number;
  }> {
    const now = new Date();

    const expired = await this.sessionRepository.find({
      where: {
        expiresAt: LessThan(now),
        revokedAt: IsNull(),
        deletedAt: IsNull(),
      },
      select: { id: true },
    });

    if (expired.length === 0) {
      return { sessionsCleanedUp: 0, tokensRevoked: 0 };
    }

    const ids = expired.map((s) => s.id);
    let tokensRevoked = 0;

    await this.sessionRepository.transaction(async (manager) => {
      await manager.softDelete(Session, ids);

      const result = await manager.update(
        OAuthRefreshToken,
        { sessionId: In(ids), revokedAt: IsNull() },
        {
          revokedAt: now,
          revokedReason: "session_expired_cleanup",
        },
      );
      tokensRevoked = result.affected ?? 0;
    });

    this.logger.log("Expired session cleanup complete", {
      sessionsCleanedUp: ids.length,
      tokensRevoked,
    });

    return { sessionsCleanedUp: ids.length, tokensRevoked };
  }

  /**
   * Parse user agent string
   */
  private parseUserAgent(userAgent?: string): {
    browser?: string;
    os?: string;
    device?: string;
    type?: string;
  } {
    if (!userAgent) {
      return {};
    }

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      browser: result.browser.name,
      os: `${result.os.name} ${result.os.version}`.trim(),
      device: result.device.model || result.device.type,
      type: result.device.type || "desktop",
    };
  }

  /**
   * Get location from IP address
   */
  private getLocationFromIP(ipAddress?: string):
    | {
        city?: string;
        country?: string;
        timezone?: string;
      }
    | undefined {
    if (!ipAddress) {
      return undefined;
    }

    const geo = geoip.lookup(ipAddress);

    if (!geo) {
      return undefined;
    }

    return {
      city: geo.city,
      country: geo.country,
      timezone: geo.timezone,
    };
  }
}
