import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { Session } from "@repo/database";
import { RedisService } from "./redis.service";
import { ConfigService } from "@nestjs/config";

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
    // 1. Create in PostgreSQL (permanent record)
    const session = await this.sessionRepository.save({
      userId: data.userId,
      tenantId: data.tenantId,
      refreshTokenFamilyId: data.refreshTokenFamilyId,
      refreshTokenHash: data.refreshTokenHash,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      deviceId: data.deviceId,
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.sessionTTL * 1000),
    });

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

    console.log(`✅ Session created: ${session.id} (PostgreSQL + Redis)`);

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
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        tenantId,
        revokedAt: IsNull(),
      },
      relations: ["user"],
    });

    if (!session) {
      return null;
    }

    // Check expiry
    if (session.expiresAt && session.expiresAt < new Date()) {
      return null;
    }

    // Rebuild cache
    const sessionData: SessionData = {
      id: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      email: session.user.email,
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
    this.sessionRepository
      .update(sessionId, { lastActivity: new Date() })
      .catch(console.error);

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
    // 1. Update PostgreSQL
    await this.sessionRepository.update(
      { id: sessionId, tenantId },
      {
        revokedAt: new Date(),
        revokedReason: reason,
        refreshTokenHash: null as unknown as string,
      },
    );

    // 2. Remove from Redis
    await this.redisService.delete(tenantId, "session", sessionId);

    console.log(`🔒 Session revoked: ${sessionId} (${reason})`);
  }

  /**
   * Revoke all user sessions (PostgreSQL + Redis)
   */
  async revokeAllUserSessions(
    tenantId: string,
    userId: string,
    reason: string = "user_logout_all",
  ): Promise<void> {
    // 1. Get all active sessions
    const sessions = await this.sessionRepository.find({
      where: {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
    });

    // 2. Revoke in PostgreSQL
    await this.sessionRepository.update(
      { userId, tenantId, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
        revokedReason: reason,
        refreshTokenHash: null as unknown as string,
      },
    );

    // 3. Remove from Redis
    for (const session of sessions) {
      await this.redisService.delete(tenantId, "session", session.id);
    }

    console.log(`🔒 All sessions revoked for user: ${userId}`);
  }

  /**
   * Revoke session family (token reuse detected)
   */
  async revokeSessionFamily(tenantId: string, familyId: string): Promise<void> {
    // 1. Get all sessions in family
    const sessions = await this.sessionRepository.find({
      where: {
        refreshTokenFamilyId: familyId,
        tenantId,
        revokedAt: IsNull(),
      },
    });

    // 2. Revoke in PostgreSQL
    await this.sessionRepository.update(
      { refreshTokenFamilyId: familyId, tenantId },
      {
        revokedAt: new Date(),
        revokedReason: "token_reuse_detected",
      },
    );

    // 3. Remove from Redis
    for (const session of sessions) {
      await this.redisService.delete(tenantId, "session", session.id);
    }

    console.log(`🚨 Session family revoked: ${familyId}`);
  }

  /**
   * Update refresh token (rotation)
   */
  async updateRefreshToken(
    tenantId: string,
    sessionId: string,
    newRefreshTokenHash: string,
  ): Promise<void> {
    // 1. Update PostgreSQL
    await this.sessionRepository.update(
      { id: sessionId, tenantId },
      {
        refreshTokenHash: newRefreshTokenHash,
        lastRefreshAt: new Date(),
        lastActivity: new Date(),
      },
    );

    // 2. Extend Redis TTL (session is being used)
    await this.redisService.extendTTL(
      tenantId,
      "session",
      sessionId,
      this.sessionTTL,
    );

    console.log(`🔄 Refresh token rotated: ${sessionId}`);
  }

  /**
   * Get active sessions for user
   */
  async getUserSessions(tenantId: string, userId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: {
        userId,
        tenantId,
        revokedAt: IsNull(),
      },
      order: {
        lastActivity: "DESC",
      },
    });
  }
}
