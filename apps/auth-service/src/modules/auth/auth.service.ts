import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { User, Session, SecurityEvent, Tenant } from "@repo/database";
import { PasswordService } from "@repo/security";
import * as crypto from "crypto";

/**
 * Authentication Service (Updated for Multi-Tenant)
 *
 * Handles all authentication business logic with tenant scoping:
 * - User registration (tenant-scoped)
 * - Login/logout (tenant-scoped)
 * - Password reset (tenant-scoped)
 * - Email verification (tenant-scoped)
 * - Session management (tenant-scoped)
 * - Security event logging (tenant-scoped)
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Register a new user (TENANT REQUIRED)
   */
  async register(data: {
    tenantId: string; // ← Now REQUIRED!
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    ip: string;
    userAgent: string;
  }) {
    // Validate tenant exists and is active
    const tenant = await this.tenantRepository.findOne({
      where: { id: data.tenantId, active: true },
    });

    if (!tenant) {
      throw new BadRequestException("Invalid or inactive tenant");
    }

    // Validate password strength
    const validation = PasswordService.validateStrength(data.password);

    if (!validation.isValid) {
      throw new BadRequestException({
        message: "Password does not meet security requirements",
        errors: validation.errors,
        score: validation.score,
      });
    }

    // Check if user already exists IN THIS TENANT
    const existingUser = await this.userRepository.findOne({
      where: {
        email: data.email,
        tenantId: data.tenantId, // ← Tenant-scoped lookup
      },
    });

    if (existingUser) {
      // Log failed registration attempt (tenant-scoped)
      await this.logSecurityEvent({
        tenantId: data.tenantId,
        eventType: "REGISTRATION_FAILED",
        severity: "warning",
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: { reason: "email_exists", email: data.email },
      });

      throw new ConflictException(
        "User with this email already exists in this tenant",
      );
    }

    // Hash password with Argon2id
    const passwordHash = await PasswordService.hash(data.password);

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    // Create user with tenantId
    const user = this.userRepository.create({
      tenantId: data.tenantId, // ← Always set tenant
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      emailVerificationToken,
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    const savedUser = await this.userRepository.save(user);

    // Log successful registration (tenant-scoped)
    await this.logSecurityEvent({
      userId: savedUser.id,
      tenantId: savedUser.tenantId,
      eventType: "USER_CREATED",
      severity: "info",
      ipAddress: data.ip,
      userAgent: data.userAgent,
      metadata: { email: savedUser.email },
    });

    // TODO: Send verification email
    // await this.emailService.sendVerificationEmail(savedUser.email, emailVerificationToken);

    return {
      id: savedUser.id,
      email: savedUser.email,
      firstName: savedUser.firstName,
      lastName: savedUser.lastName,
      message:
        "Registration successful. Please check your email to verify your account.",
    };
  }

  /**
   * Login with email and password (TENANT REQUIRED)
   */
  async login(data: {
    tenantId: string; // ← Now REQUIRED!
    email: string;
    password: string;
    ip: string;
    userAgent: string;
  }) {
    // Find user IN THIS TENANT with password hash
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.email = :email", { email: data.email })
      .andWhere("user.tenantId = :tenantId", { tenantId: data.tenantId }) // ← Tenant filter
      .getOne();

    if (!user) {
      // Log failed login (tenant-scoped)
      await this.logSecurityEvent({
        tenantId: data.tenantId,
        eventType: "LOGIN_FAILED",
        severity: "warning",
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: { reason: "user_not_found", email: data.email },
      });

      throw new UnauthorizedException("Invalid email or password");
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000 / 60,
      );

      await this.logSecurityEvent({
        userId: user.id,
        tenantId: user.tenantId,
        eventType: "LOGIN_FAILED",
        severity: "warning",
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: { reason: "account_locked", minutesLeft },
      });

      throw new UnauthorizedException(
        `Account is locked. Please try again in ${minutesLeft} minute(s).`,
      );
    }

    // Verify password
    const isPasswordValid = await PasswordService.verify(
      user.passwordHash,
      data.password,
    );

    if (!isPasswordValid) {
      // Increment failed attempts
      await this.incrementFailedAttempts(data.tenantId, user.id);

      await this.logSecurityEvent({
        userId: user.id,
        tenantId: user.tenantId,
        eventType: "LOGIN_FAILED",
        severity: "warning",
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: { reason: "invalid_password" },
      });

      throw new UnauthorizedException("Invalid email or password");
    }

    // Reset failed attempts
    await this.userRepository.update(
      { id: user.id, tenantId: data.tenantId }, // ← Tenant-scoped update
      {
        failedLoginAttempts: 0,
        lockedUntil: undefined,
        lastLoginAt: new Date(),
        lastLoginIp: data.ip,
      },
    );

    // Create session (tenant-scoped)
    const session = await this.createSession({
      tenantId: data.tenantId,
      userId: user.id,
      ipAddress: data.ip,
      userAgent: data.userAgent,
    });

    // Generate JWT tokens (include tenantId in payload)
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        sessionId: session.id, // ← Include session ID
      },
      {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: "15m", // 15 minutes
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        sessionId: session.id,
        type: "refresh",
      },
      {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
        expiresIn: "7d", // 7 days
      },
    );

    // Log successful login (tenant-scoped)
    await this.logSecurityEvent({
      userId: user.id,
      tenantId: user.tenantId,
      eventType: "LOGIN_SUCCESS",
      severity: "info",
      ipAddress: data.ip,
      userAgent: data.userAgent,
      metadata: { sessionId: session.id },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Logout - revoke current session (TENANT SCOPED)
   */
  async logout(tenantId: string, userId: string, sessionId?: string) {
    if (sessionId) {
      // Revoke specific session
      await this.sessionRepository.update(
        {
          id: sessionId,
          userId,
          tenantId, // ← Tenant filter
        },
        {
          revokedAt: new Date(),
          revokedReason: "user_logout",
        },
      );
    } else {
      // Revoke all active sessions for this user IN THIS TENANT
      await this.sessionRepository.update(
        {
          userId,
          tenantId, // ← Tenant filter
          revokedAt: IsNull(), // Only active sessions
        },
        {
          revokedAt: new Date(),
          revokedReason: "user_logout",
        },
      );
    }

    await this.logSecurityEvent({
      userId,
      tenantId,
      eventType: "LOGOUT",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });
  }

  /**
   * Request password reset (TENANT SCOPED)
   */
  async forgotPassword(tenantId: string, email: string, ip: string) {
    const user = await this.userRepository.findOne({
      where: {
        email,
        tenantId, // ← Tenant filter
      },
    });

    // Don't reveal if user exists or not (security best practice)
    if (!user) {
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        passwordResetToken: resetTokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    );

    // Log password reset request
    await this.logSecurityEvent({
      userId: user.id,
      tenantId: user.tenantId,
      eventType: "PASSWORD_RESET_REQUESTED",
      severity: "info",
      ipAddress: ip,
      userAgent: "system",
    });

    // TODO: Send password reset email
    // await this.emailService.sendPasswordResetEmail(user.email, resetToken);

    console.log("Password reset token:", resetToken); // For development
  }

  /**
   * Reset password with token (TENANT SCOPED)
   */
  async resetPassword(tenantId: string, token: string, newPassword: string) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordResetToken")
      .addSelect("user.passwordHash")
      .addSelect("user.passwordHistory")
      .where("user.passwordResetToken = :tokenHash", { tokenHash })
      .andWhere("user.tenantId = :tenantId", { tenantId }) // ← Tenant filter
      .andWhere("user.passwordResetExpiresAt > :now", { now: new Date() })
      .getOne();

    if (!user) {
      throw new BadRequestException("Invalid or expired password reset token");
    }

    // Validate new password
    const validation = PasswordService.validateStrength(newPassword);
    if (!validation.isValid) {
      throw new BadRequestException({
        message: "Password does not meet security requirements",
        errors: validation.errors,
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
    const newPasswordHash = await PasswordService.hash(newPassword);

    // Update password and history
    const updatedHistory = [user.passwordHash, ...passwordHistory].slice(0, 5);

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        passwordHash: newPasswordHash,
        passwordHistory: updatedHistory,
        passwordResetToken: undefined,
        passwordResetExpiresAt: undefined,
      },
    );

    // Log password reset
    await this.logSecurityEvent({
      userId: user.id,
      tenantId: user.tenantId,
      eventType: "PASSWORD_RESET_COMPLETED",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });

    // Revoke all sessions IN THIS TENANT (force re-login)
    await this.sessionRepository.update(
      {
        userId: user.id,
        tenantId, // ← Tenant filter
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: "password_reset",
      },
    );
  }

  /**
   * Verify email address (TENANT SCOPED)
   */
  async verifyEmail(tenantId: string, token: string) {
    const user = await this.userRepository.findOne({
      where: {
        tenantId, // ← Tenant filter
        emailVerificationToken: token,
        emailVerificationExpiresAt: MoreThan(new Date()),
      },
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired verification token");
    }

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        emailVerified: true,
        emailVerificationToken: undefined,
        emailVerificationExpiresAt: undefined,
      },
    );

    await this.logSecurityEvent({
      userId: user.id,
      tenantId: user.tenantId,
      eventType: "EMAIL_VERIFIED",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });
  }

  /**
   * Resend verification email (TENANT SCOPED)
   */
  async resendVerification(tenantId: string, email: string) {
    const user = await this.userRepository.findOne({
      where: {
        email,
        tenantId, // ← Tenant filter
      },
    });

    if (!user) {
      // Don't reveal if user exists
      return;
    }

    if (user.emailVerified) {
      throw new BadRequestException("Email is already verified");
    }

    // Generate new token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        emailVerificationToken,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    );

    // TODO: Send verification email
    // await this.emailService.sendVerificationEmail(user.email, emailVerificationToken);

    console.log("Verification token:", emailVerificationToken); // For development
  }

  /**
   * Refresh access token (TENANT SCOPED)
   */
  async refreshToken(tenantId: string, refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
      });

      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token");
      }

      // Verify tenant matches
      if (payload.tenantId !== tenantId) {
        throw new UnauthorizedException("Invalid tenant for this token");
      }

      const user = await this.userRepository.findOne({
        where: {
          id: payload.sub,
          tenantId, // ← Tenant filter
        },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // Verify session is still active
      const session = await this.sessionRepository.findOne({
        where: {
          id: payload.sessionId,
          userId: user.id,
          tenantId, // ← Tenant filter
          revokedAt: IsNull(),
        },
      });

      if (!session) {
        throw new UnauthorizedException("Session has been revoked");
      }

      // Generate new access token
      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          email: user.email,
          tenantId: user.tenantId,
          sessionId: session.id,
        },
        {
          secret: this.configService.get("JWT_SECRET"),
          expiresIn: "15m",
        },
      );

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  /**
   * Get current user (TENANT SCOPED)
   */
  async getCurrentUser(tenantId: string, userId: string) {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        tenantId, // ← Tenant filter
      },
      relations: ["tenant"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug, // ← Use 'slug' not 'subdomain'
      },
    };
  }

  /**
   * Create session (TENANT SCOPED) - PRIVATE METHOD
   */
  private async createSession(data: {
    tenantId: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Session> {
    const refreshTokenFamilyId = crypto.randomUUID();
    const deviceId = crypto.randomBytes(16).toString("hex");

    const session = this.sessionRepository.create({
      tenantId: data.tenantId, // ← Always set tenant
      userId: data.userId,
      refreshTokenFamilyId,
      deviceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return this.sessionRepository.save(session);
  }

  /**
   * Increment failed login attempts (TENANT SCOPED) - PRIVATE METHOD
   */
  private async incrementFailedAttempts(tenantId: string, userId: string) {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        tenantId, // ← Tenant filter
      },
    });

    if (!user) return;

    const newAttempts = user.failedLoginAttempts + 1;

    // Lock account after 5 failed attempts
    const update: any = {
      failedLoginAttempts: newAttempts,
    };

    if (newAttempts >= 5) {
      update.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }

    await this.userRepository.update(
      { id: userId, tenantId }, // ← Tenant-scoped update
      update,
    );
  }

  /**
   * Log security event (TENANT SCOPED) - PRIVATE METHOD
   */
  private async logSecurityEvent(data: {
    userId?: string;
    tenantId: string; // ← Now REQUIRED!
    eventType: string;
    severity: "info" | "warning" | "critical";
    ipAddress: string;
    userAgent: string;
    metadata?: Record<string, any>;
  }) {
    await this.securityEventRepository.save({
      tenantId: data.tenantId, // ← Always set tenant
      userId: data.userId,
      eventType: data.eventType,
      severity: data.severity,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      metadata: data.metadata || {},
    });
  }
}
