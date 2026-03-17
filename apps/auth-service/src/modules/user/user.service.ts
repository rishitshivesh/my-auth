import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull, In } from "typeorm";
import {
  User,
  Session,
  SecurityEventType,
  SecurityEvent,
} from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
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
    private readonly securityEventService: SecurityEventService,
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
    this.securityEventService.log({
      userId,
      tenantId: user.tenantId,
      actorEmail: user.email,
      eventType: SecurityEventType.USER_UPDATED,
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

    if (user.passwordHash) {
      // Verify current password
      const isValid = await PasswordService.verify(
        user.passwordHash,
        currentPassword,
      );

      if (!isValid) {
        this.securityEventService.log({
          userId,
          tenantId: user.tenantId,
          actorEmail: user.email,
          eventType: SecurityEventType.PASSWORD_CHANGE_FAILED,
          severity: "warning",
          ipAddress: "0.0.0.0",
          userAgent: "system",
          metadata: { reason: "invalid_current_password" },
        });

        throw new UnauthorizedException("Current password is incorrect");
      }
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
    const updatedHistory = [
      ...(user.passwordHash ? [user.passwordHash] : []),
      ...passwordHistory,
    ].slice(0, 5);

    await this.userRepository.update(userId, {
      passwordHash: newHash,
      passwordHistory: updatedHistory,
      passwordChangedAt: new Date(),
      forcePasswordChange: false,
    });

    // Log password change
    this.securityEventService.log({
      userId,
      tenantId: user.tenantId,
      actorEmail: user.email,
      eventType: SecurityEventType.PASSWORD_CHANGED,
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

    this.securityEventService.log({
      userId,
      tenantId,
      eventType: SecurityEventType.SESSION_REVOKED,
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
      resourceId: sessionId,
      resourceType: "session",
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

    this.securityEventService.log({
      userId,
      tenantId,
      eventType: SecurityEventType.ALL_SESSIONS_REVOKED,
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
    const isValid = await PasswordService.verify(
      user.passwordHash ?? "",
      password,
    );

    if (!isValid) {
      this.securityEventService.log({
        userId,
        tenantId: user.tenantId,
        actorEmail: user.email,
        eventType: SecurityEventType.USER_DELETION_FAILED,
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
    this.securityEventService.log({
      userId,
      tenantId: user.tenantId,
      actorEmail: user.email,
      eventType: SecurityEventType.USER_DELETED,
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

      this.securityEventService.log({
        userId,
        tenantId: user.tenantId,
        actorEmail: user.email,
        eventType: SecurityEventType.USER_LOCKED,
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

  // ============================================================
  // ADD THIS METHOD TO UserService CLASS
  // ============================================================

  /**
   * List users with pagination, filtering, and search
   *
   * @param tenantId - Tenant ID to filter users
   * @param options - Pagination and filtering options
   * @returns Paginated list of users
   *
   * @example
   * // Simple pagination
   * const result = await userService.listUsers(tenantId, { page: 1, limit: 20 });
   *
   * @example
   * // With search
   * const result = await userService.listUsers(tenantId, {
   *   page: 1,
   *   limit: 20,
   *   search: 'john',
   * });
   *
   * @example
   * // With filters
   * const result = await userService.listUsers(tenantId, {
   *   page: 1,
   *   limit: 20,
   *   emailVerified: true,
   *   isActive: true,
   *   sortBy: 'createdAt',
   *   sortOrder: 'DESC',
   * });
   */
  async listUsers(
    tenantId: string,
    options: ListUsersOptions = {},
  ): Promise<PaginatedUsersResponse> {
    // Default values
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20)); // Max 100 per page
    const sortBy = options.sortBy || "createdAt";
    const sortOrder = options.sortOrder || "DESC";
    const skip = (page - 1) * limit;

    // Validate sortBy field
    const allowedSortFields = [
      "createdAt",
      "updatedAt",
      "email",
      "firstName",
      "lastName",
      "lastLoginAt",
    ];

    if (!allowedSortFields.includes(sortBy)) {
      throw new BadRequestException(
        `Invalid sort field. Allowed: ${allowedSortFields.join(", ")}`,
      );
    }

    // Build query
    const queryBuilder = this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.tenant", "tenant")
      .where("user.tenantId = :tenantId", { tenantId });

    // Apply search filter
    if (options.search) {
      const searchTerm = `%${options.search}%`;
      queryBuilder.andWhere(
        "(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.displayName ILIKE :search)",
        { search: searchTerm },
      );
    }

    // Apply isActive filter
    if (options.isActive !== undefined) {
      queryBuilder.andWhere("user.isActive = :isActive", {
        isActive: options.isActive,
      });
    }

    // Apply emailVerified filter
    if (options.emailVerified !== undefined) {
      queryBuilder.andWhere("user.emailVerified = :emailVerified", {
        emailVerified: options.emailVerified,
      });
    }

    // Apply date range filters
    if (options.createdAfter) {
      queryBuilder.andWhere("user.createdAt >= :createdAfter", {
        createdAfter: options.createdAfter,
      });
    }

    if (options.createdBefore) {
      queryBuilder.andWhere("user.createdAt <= :createdBefore", {
        createdBefore: options.createdBefore,
      });
    }

    if (options.role) {
      queryBuilder
        .leftJoin("user.userRoles", "userRole")
        .leftJoin("userRole.role", "role")
        .andWhere("role.name = :role", { role: options.role });
    }

    // Apply sorting
    queryBuilder.orderBy(`user.${sortBy}`, sortOrder);

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const users = await queryBuilder.skip(skip).take(limit).getMany();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Format response
    const formattedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
          }
        : undefined,
    }));

    return {
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };
  }

  /**
   * Get user statistics for admin dashboard
   */
  async getUserStats(tenantId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    verified: number;
    unverified: number;
    recentLogins: number; // Last 7 days
  }> {
    const total = await this.userRepository.count({
      where: { tenantId },
    });

    const active = await this.userRepository.count({
      where: { tenantId, isActive: true },
    });

    const verified = await this.userRepository.count({
      where: { tenantId, emailVerified: true },
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentLogins = await this.userRepository.count({
      where: {
        tenantId,
        lastLoginAt: MoreThan(sevenDaysAgo),
      },
    });

    return {
      total,
      active,
      inactive: total - active,
      verified,
      unverified: total - verified,
      recentLogins,
    };
  }

  /**
   * Bulk activate/deactivate users
   */
  async bulkUpdateActiveStatus(
    tenantId: string,
    userIds: string[],
    isActive: boolean,
    adminUserId: string,
  ): Promise<{ updated: number }> {
    if (userIds.length === 0) {
      return { updated: 0 };
    }

    // Verify all users belong to tenant
    const users = await this.userRepository.find({
      where: {
        id: In(userIds),
        tenantId,
      },
    });

    if (users.length !== userIds.length) {
      throw new BadRequestException(
        "Some users not found or belong to different tenant",
      );
    }

    // Update all users
    const result = await this.userRepository.update(
      {
        id: In(userIds),
        tenantId,
      },
      { isActive },
    );

    // Log security event for each user
    for (const user of users) {
      this.securityEventService.log({
        userId: user.id,
        tenantId,
        actorEmail: user.email,
        eventType: isActive
          ? SecurityEventType.USER_ACTIVATED
          : SecurityEventType.USER_DEACTIVATED,
        severity: "info",
        ipAddress: "0.0.0.0",
        userAgent: "system",
        metadata: { performedBy: adminUserId },
      });
    }

    console.log(
      `✅ Bulk ${isActive ? "activated" : "deactivated"} ${users.length} users`,
    );

    return { updated: result.affected || 0 };
  }

  /**
   * Export users to CSV format
   */
  async exportUsers(
    tenantId: string,
    options: ListUsersOptions = {},
  ): Promise<string> {
    // Get all users (no pagination)
    const result = await this.listUsers(tenantId, {
      ...options,
      limit: 10000, // Max export limit
    });

    // Generate CSV
    const headers = [
      "ID",
      "Email",
      "First Name",
      "Last Name",
      "Display Name",
      "Email Verified",
      "Active",
      "Last Login",
      "Created At",
    ];

    const rows = result.users.map((user) => [
      user.id,
      user.email,
      user.firstName || "",
      user.lastName || "",
      user.displayName || "",
      user.emailVerified ? "Yes" : "No",
      user.isActive ? "Yes" : "No",
      user.lastLoginAt ? user.lastLoginAt.toISOString() : "Never",
      user.createdAt.toISOString(),
    ]);

    // CSV format
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    return csv;
  }
}

/**
 * Pagination options for listing users
 */
export interface ListUsersOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  search?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  role?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * Paginated response for listing users
 */
export interface PaginatedUsersResponse {
  users: Array<{
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    emailVerified: boolean;
    isActive: boolean;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    tenant?: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
