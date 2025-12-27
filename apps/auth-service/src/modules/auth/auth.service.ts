import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { User, Session, SecurityEvent, Tenant } from "@repo/database";
import { PasswordService } from "@repo/security";
import * as crypto from "crypto";

/**
 * Authentication Service
 *
 * Handles all authentication business logic:
 * - User registration
 * - Login/logout
 * - Password reset
 * - Email verification
 * - Session management
 * - Security event logging
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
  ) {}

  /**
   * Register a new user
   */
  async register(data: {
    email: string;
    password: string;
    tenantId?: string;
    firstName?: string;
    lastName?: string;
    ip: string;
    userAgent: string;
  }) {
    // Validate password strength
    const validation = PasswordService.validateStrength(data.password);

    if (!validation.isValid) {
      throw new BadRequestException({
        message: "Password does not meet security requirements",
        errors: validation.errors,
        score: validation.score,
      });
    }

    // Get or create default tenant
    let tenantId = data.tenantId;
    if (!tenantId) {
      // Create a default tenant for this user (you can customize this logic)
      const defaultTenant = await this.tenantRepository.findOne({
        where: { subdomain: "default" },
      });

      if (!defaultTenant) {
        const newTenant = this.tenantRepository.create({
          name: "Default Organization",
          subdomain: "default",
          status: "active",
          plan: "free",
        });
        const savedTenant = await this.tenantRepository.save(newTenant);
        tenantId = savedTenant.id;
      } else {
        tenantId = defaultTenant.id;
      }
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: data.email, tenantId },
    });

    if (existingUser) {
      // Log failed registration attempt
      await this.logSecurityEvent({
        eventType: "REGISTRATION_FAILED",
        severity: "warning",
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: { reason: "email_exists", email: data.email },
        tenantId,
      });

      throw new ConflictException("User with this email already exists");
    }

    // Hash password with Argon2id
    const passwordHash = await PasswordService.hash(data.password);

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    // Create user
    const user = this.userRepository.create({
      email: data.email,
      passwordHash,
      tenantId,
      firstName: data.firstName,
      lastName: data.lastName,
      emailVerificationToken,
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      passwordChangedAt: new Date(),
      status: "active",
    });

    const savedUser = await this.userRepository.save(user);

    // Log successful registration
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
   * Login with email and password
   */
  async login(data: {
    email: string;
    password: string;
    tenantId?: string;
    ip: string;
    userAgent: string;
  }) {
    // Find user with password hash
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.email = :email", { email: data.email })
      .andWhere(data.tenantId ? "user.tenantId = :tenantId" : "1=1", {
        tenantId: data.tenantId,
      })
      .getOne();

    if (!user) {
      // Log failed login
      await this.logSecurityEvent({
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

    // Check account status
    if (user.status !== "active") {
      await this.logSecurityEvent({
        userId: user.id,
        tenantId: user.tenantId,
        eventType: "LOGIN_FAILED",
        severity: "warning",
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: { reason: "account_inactive", status: user.status },
      });

      throw new UnauthorizedException("Account is not active");
    }

    // Verify password
    const isPasswordValid = await PasswordService.verify(
      user.passwordHash,
      data.password,
    );

    if (!isPasswordValid) {
      // Increment failed attempts
      await this.incrementFailedAttempts(user.id);

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
    await this.userRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: undefined,
      lastLoginAt: new Date(),
      lastLoginIp: data.ip,
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const session = this.sessionRepository.create({
      userId: user.id,
      tokenHash,
      ipAddress: data.ip,
      userAgent: data.userAgent,
      deviceInfo: {
        fingerprint: crypto.randomBytes(16).toString("hex"),
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    await this.sessionRepository.save(session);

    // Generate JWT tokens
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
      },
      {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: "15m", // 15 minutes
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        type: "refresh",
      },
      {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
        expiresIn: "7d", // 7 days
      },
    );

    // Log successful login
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
   * Logout - revoke current session
   */
  async logout(userId: string) {
    // Revoke all active sessions for this user
    await this.sessionRepository.update(
      { userId, isActive: true },
      {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: "user_logout",
      },
    );

    await this.logSecurityEvent({
      userId,
      eventType: "LOGOUT",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string, ip: string) {
    const user = await this.userRepository.findOne({ where: { email } });

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

    await this.userRepository.update(user.id, {
      passwordResetToken: resetTokenHash,
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

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
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordResetToken")
      .addSelect("user.passwordHash")
      .addSelect("user.passwordHistory")
      .where("user.passwordResetToken = :tokenHash", { tokenHash })
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

    await this.userRepository.update(user.id, {
      passwordHash: newPasswordHash,
      passwordHistory: updatedHistory,
      passwordChangedAt: new Date(),
      passwordResetToken: undefined,
      passwordResetExpiresAt: undefined,
      forcePasswordChange: false,
    });

    // Log password reset
    await this.logSecurityEvent({
      userId: user.id,
      tenantId: user.tenantId,
      eventType: "PASSWORD_RESET_COMPLETED",
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });

    // Revoke all sessions (force re-login)
    await this.sessionRepository.update(
      { userId: user.id, isActive: true },
      {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: "password_reset",
      },
    );
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string) {
    const user = await this.userRepository.findOne({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: MoreThan(new Date()),
      },
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired verification token");
    }

    await this.userRepository.update(user.id, {
      emailVerified: true,
      emailVerificationToken: undefined,
      emailVerificationExpiresAt: undefined,
    });

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
   * Resend verification email
   */
  async resendVerification(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if user exists
      return;
    }

    if (user.emailVerified) {
      throw new BadRequestException("Email is already verified");
    }

    // Generate new token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    await this.userRepository.update(user.id, {
      emailVerificationToken,
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // TODO: Send verification email
    // await this.emailService.sendVerificationEmail(user.email, emailVerificationToken);

    console.log("Verification token:", emailVerificationToken); // For development
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
      });

      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token");
      }

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user || user.status !== "active") {
        throw new UnauthorizedException("User not found or inactive");
      }

      // Generate new access token
      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          email: user.email,
          tenantId: user.tenantId,
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
   * Get current user
   */
  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
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
      status: user.status,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        subdomain: user.tenant.subdomain,
      },
    };
  }

  /**
   * Increment failed login attempts
   */
  private async incrementFailedAttempts(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;

    const newAttempts = user.failedLoginAttempts + 1;

    // Lock account after 5 failed attempts
    const update: any = {
      failedLoginAttempts: newAttempts,
    };

    if (newAttempts >= 5) {
      update.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }

    await this.userRepository.update(userId, update);
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
