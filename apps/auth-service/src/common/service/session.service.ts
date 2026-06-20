import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { Session, Tenant } from "@repo/database";
import { RedisService } from "./redis.service";
import { ConfigService } from "@nestjs/config";
import { logger } from "@/common/logger";

export interface SessionData {
  id: string;
  userId: string;
  tenantId: string;
  email: string;
  refreshTokenFamilyId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  private sessionTTL: number;

  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {
    this.sessionTTL = this.configService.get("SESSION_TTL", 604800); // 7 days
  }

  private async getSchemaName(tenantId: string): Promise<string> {
    const platformSlug = process.env.SENTRY_PLATFORM_SLUG ?? "sentry";
    if (!tenantId) {
      return `fk_${platformSlug}`;
    }
    const tenant = await this.sessionRepository.manager.findOne(Tenant, {
      where: { id: tenantId }
    });
    const slug = tenant?.slug ?? platformSlug;
    return `fk_${slug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
  }

  /**
   * Create session (PostgreSQL + Redis)
   */
  async createSession(data: {
    userId: string;
    tenantId: string;
    email: string;
    refreshTokenFamilyId?: string;
    refreshTokenHash?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
  }): Promise<Session> {
    const schemaName = await this.getSchemaName(data.tenantId);
    const expiresAt = new Date(Date.now() + this.sessionTTL * 1000);
    const lastActivity = new Date();

    // 1. Create in PostgreSQL (permanent record in correct tenant schema)
    const query = `
      INSERT INTO "${schemaName}"."sessions" (
        "user_id", "tenant_id", "refresh_token_family_id", "refresh_token_hash",
        "ip_address", "user_agent", "device_id", "last_activity", "expires_at"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const rows = await this.sessionRepository.manager.query(query, [
      data.userId,
      data.tenantId,
      data.refreshTokenFamilyId || null,
      data.refreshTokenHash || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.deviceId || null,
      lastActivity,
      expiresAt,
    ]);
    const rawSession = rows[0];
    const session = {
      id: rawSession.id,
      userId: rawSession.user_id,
      tenantId: rawSession.tenant_id,
      refreshTokenFamilyId: rawSession.refresh_token_family_id,
      refreshTokenHash: rawSession.refresh_token_hash,
      ipAddress: rawSession.ip_address,
      userAgent: rawSession.user_agent,
      deviceId: rawSession.device_id,
      lastActivity: rawSession.last_activity ? new Date(rawSession.last_activity) : null,
      expiresAt: rawSession.expires_at ? new Date(rawSession.expires_at) : null,
      createdAt: rawSession.created_at ? new Date(rawSession.created_at) : null,
    } as Session;

    // 2. Store in Redis (fast lookup)
    const sessionData: SessionData = {
      id: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      email: data.email,
      refreshTokenFamilyId: session.refreshTokenFamilyId!,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceId: session.deviceId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt!,
    };

    await this.redisService.set(
      data.tenantId,
      "session",
      session.id,
      sessionData,
      this.sessionTTL,
    );

    logger.info({ sessionId: session.id }, "Session created (PostgreSQL + Redis)");

    return session;
  }

  /**
   * Validate session (Redis first, PostgreSQL fallback)
   */
  async validateSession(
    tenantId: string,
    sessionId: string,
  ): Promise<SessionData | null> {
    // 1. Try Redis first (fast path)
    const cached = await this.redisService.get<SessionData>(
      tenantId,
      "session",
      sessionId,
    );

    if (cached) {
      // Check expiry
      if (new Date(cached.expiresAt) < new Date()) {
        // Expired - remove from Redis
        await this.redisService.delete(tenantId, "session", sessionId);
        return null;
      }

      // Extend activity (update TTL)
      await this.redisService.extendTTL(
        tenantId,
        "session",
        sessionId,
        this.sessionTTL,
      );

      return cached;
    }

    // 2. Fallback to PostgreSQL (cache miss)
    const schemaName = await this.getSchemaName(tenantId);
    const rows = await this.sessionRepository.manager.query(
      `SELECT s.*, u.email as "userEmail" FROM "${schemaName}"."sessions" s
       LEFT JOIN "${schemaName}"."users" u ON u.id = s.user_id
       WHERE s.id = $1 AND s.tenant_id = $2 AND s.revoked_at IS NULL LIMIT 1`,
      [sessionId, tenantId]
    );
    const rawSession = rows[0];

    if (!rawSession) {
      return null;
    }

    const session = {
      id: rawSession.id,
      userId: rawSession.user_id,
      tenantId: rawSession.tenant_id,
      refreshTokenFamilyId: rawSession.refresh_token_family_id,
      ipAddress: rawSession.ip_address,
      userAgent: rawSession.user_agent,
      deviceId: rawSession.device_id,
      createdAt: rawSession.created_at ? new Date(rawSession.created_at) : null,
      expiresAt: rawSession.expires_at ? new Date(rawSession.expires_at) : null,
    } as any;

    const userEmail = rawSession.userEmail;

    // Check expiry
    if (session.expiresAt && session.expiresAt < new Date()) {
      return null;
    }

    // Rebuild cache
    const sessionData: SessionData = {
      id: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      email: userEmail || '',
      refreshTokenFamilyId: session.refreshTokenFamilyId!,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceId: session.deviceId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt!,
    };

    // Cache it
    await this.redisService.set(
      tenantId,
      "session",
      sessionId,
      sessionData,
      this.sessionTTL,
    );

    // Update last activity in DB (async, don't wait)
    this.sessionRepository.manager.query(
      `UPDATE "${schemaName}"."sessions" SET last_activity = $1 WHERE id = $2`,
      [new Date(), sessionId]
    ).catch((err) => logger.error({ err }, "Failed to update session last activity"));

    return sessionData;
  }

  /**
   * Revoke session (PostgreSQL + Redis)
   */
  async revokeSession(
    tenantId: string,
    sessionId: string,
    reason: string = "user_logout",
  ): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    // 1. Update PostgreSQL
    await this.sessionRepository.manager.query(
      `UPDATE "${schemaName}"."sessions"
       SET revoked_at = $1, revoked_reason = $2, refresh_token_hash = NULL
       WHERE id = $3 AND tenant_id = $4`,
      [new Date(), reason, sessionId, tenantId]
    );

    // 2. Remove from Redis
    await this.redisService.delete(tenantId, "session", sessionId);

    logger.info({ sessionId, reason }, "Session revoked");
  }

  /**
   * Revoke all user sessions (PostgreSQL + Redis)
   */
  async revokeAllUserSessions(
    tenantId: string,
    userId: string,
    reason: string = "user_logout_all",
  ): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    // 1. Get all active sessions
    const sessions = await this.sessionRepository.manager.query(
      `SELECT id FROM "${schemaName}"."sessions"
       WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [userId, tenantId]
    );

    // 2. Revoke in PostgreSQL
    await this.sessionRepository.manager.query(
      `UPDATE "${schemaName}"."sessions"
       SET revoked_at = $1, revoked_reason = $2, refresh_token_hash = NULL
       WHERE user_id = $3 AND tenant_id = $4 AND revoked_at IS NULL`,
      [new Date(), reason, userId, tenantId]
    );

    // 3. Remove from Redis
    for (const session of sessions) {
      await this.redisService.delete(tenantId, "session", session.id);
    }

    logger.info({ userId }, "All sessions revoked for user");
  }

  /**
   * Revoke session family (token reuse detected)
   */
  async revokeSessionFamily(tenantId: string, familyId: string): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    // 1. Get all sessions in family
    const sessions = await this.sessionRepository.manager.query(
      `SELECT id FROM "${schemaName}"."sessions"
       WHERE refresh_token_family_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [familyId, tenantId]
    );

    // 2. Revoke in PostgreSQL
    await this.sessionRepository.manager.query(
      `UPDATE "${schemaName}"."sessions"
       SET revoked_at = $1, revoked_reason = $2
       WHERE refresh_token_family_id = $3 AND tenant_id = $4`,
      [new Date(), "token_reuse_detected", familyId, tenantId]
    );

    // 3. Remove from Redis
    for (const session of sessions) {
      await this.redisService.delete(tenantId, "session", session.id);
    }

    logger.warn({ familyId }, "Session family revoked");
  }

  /**
   * Update refresh token (rotation)
   */
  async updateRefreshToken(
    tenantId: string,
    sessionId: string,
    newRefreshTokenHash: string,
  ): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    // 1. Update PostgreSQL
    await this.sessionRepository.manager.query(
      `UPDATE "${schemaName}"."sessions"
       SET refresh_token_hash = $1, last_refresh_at = $2, last_activity = $3
       WHERE id = $4 AND tenant_id = $5`,
      [newRefreshTokenHash, new Date(), new Date(), sessionId, tenantId]
    );

    // 2. Extend Redis TTL (session is being used)
    await this.redisService.extendTTL(
      tenantId,
      "session",
      sessionId,
      this.sessionTTL,
    );

    logger.info({ sessionId }, "Refresh token rotated");
  }

  /**
   * Get active sessions for user
   */
  async getUserSessions(tenantId: string, userId: string): Promise<Session[]> {
    const schemaName = await this.getSchemaName(tenantId);
    const rows = await this.sessionRepository.manager.query(
      `SELECT * FROM "${schemaName}"."sessions"
       WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL
       ORDER BY last_activity DESC`,
      [userId, tenantId]
    );
    return rows.map((rawSession: any) => ({
      id: rawSession.id,
      userId: rawSession.user_id,
      tenantId: rawSession.tenant_id,
      refreshTokenFamilyId: rawSession.refresh_token_family_id,
      refreshTokenHash: rawSession.refresh_token_hash,
      ipAddress: rawSession.ip_address,
      userAgent: rawSession.user_agent,
      deviceId: rawSession.device_id,
      lastActivity: rawSession.last_activity ? new Date(rawSession.last_activity) : null,
      expiresAt: rawSession.expires_at ? new Date(rawSession.expires_at) : null,
      createdAt: rawSession.created_at ? new Date(rawSession.created_at) : null,
    })) as Session[];
  }
}
