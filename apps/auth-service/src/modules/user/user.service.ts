import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull } from "typeorm";
import { User, Session, SecurityEvent } from "@repo/database";
import { PasswordService } from "@repo/security";

/**
 * User Service
 *
 * Handles all user management business logic:
 * - User CRUD operations
 * - Password management
 * - Session management
 * - Security event tracking
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
  ) {}

  /**
   * Find user by ID
   */
  async findById(tenantId: string, id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, tenantId },
      relations: ["tenant"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const where: any = { email };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    return this.userRepository.findOne({
      where,
      relations: ["tenant", "mfaSettings"],
    });
  }

  /**
   * Update user profile
   */
  async update(
    tenantId: string,
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      displayName?: string;
      phone?: string;
      avatarUrl?: string;
      timezone?: string;
      language?: string;
    },
  ) {
    const user = await this.findById(tenantId, userId);

    Object.assign(user, data);
    await this.userRepository.save(user);

    // Log profile update
    await this.logSecurityEvent({
      userId,
      tenantId: user.tenantId,
      eventType: "USER_UPDATED",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
      metadata: { fields: Object.keys(data) },
    });

    return user;
  }

  /**
   * Change password
   */
  async changePassword(
    tenantId: string,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // Get user with password hash
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .addSelect("user.passwordHistory")
      .where("user.id = :id", { id: userId })
      .where("user.tenant_id = :tenantId", { tenantId })
      .getOne();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Verify current password
    const isValid = await PasswordService.verify(
      user.passwordHash,
      currentPassword,
    );

    if (!isValid) {
      await this.logSecurityEvent({
        userId,
        tenantId: user.tenantId,
        eventType: "PASSWORD_CHANGE_FAILED",
        severity: "warning",
        ipAddress: "0.0.0.0",
        userAgent: "system",
        metadata: { reason: "invalid_current_password" },
      });

      throw new UnauthorizedException("Current password is incorrect");
    }

    // Validate new password strength
    const validation = PasswordService.validateStrength(newPassword);
    if (!validation.isValid) {
      throw new BadRequestException({
        message: "New password does not meet security requirements",
        errors: validation.errors,
        score: validation.score,
      });
    }

    // Check password history
    const passwordHistory = user.passwordHistory || [];
    for (const oldHash of passwordHistory) {
      const isReused = await PasswordService.verify(oldHash, newPassword);
      if (isReused) {
        throw new BadRequestException(
          "Password has been used recently. Please choose a different password.",
        );
      }
    }

    // Hash new password
    const newHash = await PasswordService.hash(newPassword);

    // Update password and history
    const updatedHistory = [user.passwordHash, ...passwordHistory].slice(0, 5);

    await this.userRepository.update(userId, {
      passwordHash: newHash,
      passwordHistory: updatedHistory,
      passwordChangedAt: new Date(),
      forcePasswordChange: false,
    });

    // Log password change
    await this.logSecurityEvent({
      userId,
      tenantId: user.tenantId,
      eventType: "PASSWORD_CHANGED",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });

    // Revoke all sessions except current (force re-login on other devices)
    await this.sessionRepository.update(
      { userId, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
        revokedReason: "password_changed",
      },
    );
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(tenantId: string, userId: string) {
    const sessions = await this.sessionRepository.find({
      where: {
        userId,
        revokedAt: IsNull(),
        tenantId,
        expiresAt: MoreThan(new Date()),
      },
      order: {
        lastActivity: "DESC",
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      location: session.location,
      lastActivity: session.lastActivity,
      createdAt: session.createdAt,
    }));
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(tenantId: string, userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId, tenantId },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    await this.sessionRepository.update(sessionId, {
      revokedAt: new Date(),
      revokedReason: "manual_revocation",
    });

    await this.logSecurityEvent({
      userId,
      eventType: "SESSION_REVOKED",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
      metadata: { sessionId },
    });
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllSessions(tenantId: string, userId: string) {
    await this.sessionRepository.update(
      { userId, revokedAt: IsNull(), tenantId },
      {
        revokedAt: new Date(),
        revokedReason: "user_request",
      },
    );

    await this.logSecurityEvent({
      userId,
      eventType: "ALL_SESSIONS_REVOKED",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });
  }

  /**
   * Get security events for user
   */
  async getSecurityEvents(
    tenantId: string,
    userId: string,
    limit: number = 50,
  ) {
    const events = await this.securityEventRepository.find({
      where: { userId, tenantId },
      order: { createdAt: "DESC" },
      take: limit,
    });

    return events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      severity: event.severity,
      ipAddress: event.ipAddress,
      location: event.location,
      metadata: event.metadata,
      createdAt: event.createdAt,
    }));
  }

  /**
   * Delete account (soft delete)
   */
  async deleteAccount(tenantId: string, userId: string, password: string) {
    // Get user with password hash
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :id", { id: userId })
      .where("user.tenant_id = :id", { id: tenantId })
      .getOne();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Verify password
    const isValid = await PasswordService.verify(user.passwordHash, password);

    if (!isValid) {
      await this.logSecurityEvent({
        userId,
        tenantId: user.tenantId,
        eventType: "ACCOUNT_DELETION_FAILED",
        severity: "warning",
        ipAddress: "0.0.0.0",
        userAgent: "system",
        metadata: { reason: "invalid_password" },
      });

      throw new UnauthorizedException("Password is incorrect");
    }

    // Soft delete user
    await this.userRepository.softDelete(userId);

    // Revoke all sessions
    await this.sessionRepository.update(
      { userId, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
        revokedReason: "account_deleted",
      },
    );

    // Log account deletion
    await this.logSecurityEvent({
      userId,
      tenantId: user.tenantId,
      eventType: "ACCOUNT_DELETED",
      severity: "critical",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(tenantId: string, userId: string): Promise<boolean> {
    const user = await this.findById(tenantId, userId);

    if (!user.lockedUntil) {
      return false;
    }

    return user.lockedUntil > new Date();
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(tenantId: string, userId: string) {
    const user = await this.findById(tenantId, userId);

    const newAttempts = user.failedLoginAttempts + 1;

    const update: any = {
      failedLoginAttempts: newAttempts,
    };

    // Lock account after 5 failed attempts
    if (newAttempts >= 5) {
      update.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await this.logSecurityEvent({
        userId,
        tenantId: user.tenantId,
        eventType: "ACCOUNT_LOCKED",
        severity: "critical",
        ipAddress: "0.0.0.0",
        userAgent: "system",
        metadata: { attempts: newAttempts },
      });
    }

    await this.userRepository.update(userId, update);
  }

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(tenantId: string, userId: string) {
    await this.userRepository.update(userId, {
      failedLoginAttempts: 0,
      lockedUntil: undefined,
    });
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(tenantId: string, userId: string, ip: string) {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      failedLoginAttempts: 0,
      lockedUntil: undefined,
    });
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(data: {
    userId?: string;
    tenantId?: string;
    eventType: string;
    severity: "info" | "warning" | "critical";
    ipAddress: string;
    userAgent: string;
    metadata?: Record<string, any>;
  }) {
    await this.securityEventRepository.save({
      userId: data.userId,
      tenantId: data.tenantId,
      eventType: data.eventType,
      severity: data.severity,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      metadata: data.metadata || {},
    });
  }
}
