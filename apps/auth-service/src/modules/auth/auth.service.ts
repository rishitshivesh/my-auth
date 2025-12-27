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
import { v4 as uuidv4 } from "uuid";
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
    tenantId: string;
    email: string;
    password: string;
    ip: string;
    userAgent: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const { tenantId, email, password, ip, userAgent } = data;

    // Find user
    const user = await this.userRepository.findOne({
      where: { email, tenantId },
      relations: ["tenant"],
      select: {
        id: true,
        email: true,
        passwordHash: true, // ← Force select this hidden field
        firstName: true,
        lastName: true,
        emailVerified: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log("🔍 Login attempt:", { email, tenantId, userFound: !!user }); // ← ADD

    if (!user) {
      await this.logSecurityEvent({
        tenantId,
        eventType: "login_failed",
        severity: "critical",
        ipAddress: ip,
        userAgent,
        metadata: { email, reason: "user_not_found" },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    console.log("🔍 User found:", {
      userId: user.id,
      user,
      hasPassword: !!user.passwordHash,
      passwordHashStart: user.passwordHash?.substring(0, 20),
    }); // ← ADD

    // Verify password
    const isValid = await PasswordService.verify(user.passwordHash, password);

    console.log("🔍 Password check:", { isValid }); // ← ADD

    if (!isValid) {
      await this.logSecurityEvent({
        tenantId,
        userId: user.id,
        eventType: "login_failed",
        severity: "critical",
        ipAddress: ip,
        userAgent,
        metadata: { email, reason: "invalid_password" },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    // Check if email verified (if required)
    if (
      !user.emailVerified &&
      user.tenant.featureFlags?.emailVerificationRequired
    ) {
      throw new UnauthorizedException("Please verify your email first");
    }

    // Check if account is active
    if (
      !user.emailVerified &&
      user.tenant.featureFlags?.emailVerificationRequired
    ) {
      throw new UnauthorizedException("Please verify your email first");
    }
    // === REFRESH TOKEN ROTATION LOGIC ===

    // 1. Generate new family ID
    const familyId = uuidv4();

    // 2. Generate refresh token (opaque random string)
    const refreshToken = crypto.randomBytes(32).toString("hex");

    // 3. Hash it before storing
    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // 4. Create session with family
    const session = await this.sessionRepository.save({
      userId: user.id,
      tenantId,
      refreshTokenFamilyId: familyId,
      refreshTokenHash,
      ipAddress: ip,
      userAgent,
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // 5. Generate access token
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        tenantId,
        sessionId: session.id,
      },
      {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: "15m", // 15 minutes
      },
    );

    // Log successful login
    await this.logSecurityEvent({
      tenantId,
      userId: user.id,
      eventType: "login_success",
      severity: "info",
      ipAddress: ip,
      userAgent,
      metadata: { sessionId: session.id, familyId },
    });

    return {
      accessToken,
      refreshToken, // ← Return plaintext token to user
      user: {
        // id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        // tenant: {
        //   id: user.tenant.id,
        //   name: user.tenant.name,
        //   slug: user.tenant.slug,
        // },
      },
    };
  }

  /**
   * Logout - revoke current session (TENANT SCOPED)
   */
  async logout(
    tenantId: string,
    userId: string,
    sessionId?: string,
  ): Promise<void> {
    if (sessionId) {
      // Logout specific session
      await this.sessionRepository.update(
        {
          id: sessionId,
          userId,
          tenantId,
        },
        {
          revokedAt: new Date(),
          revokedReason: "user_logout",
        },
      );
    } else {
      // Logout all active sessions for user
      await this.sessionRepository.update(
        {
          userId,
          tenantId,
          revokedAt: IsNull(),
        },
        {
          revokedAt: new Date(),
          revokedReason: "user_logout_all",
        },
      );
    }

    await this.logSecurityEvent({
      tenantId,
      userId,
      eventType: "logout",
      severity: "info",
      metadata: { sessionId },
    } as any);
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
  async refreshToken(
    tenantId: string,
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // 1. Hash the incoming token
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // 2. Find session by hash
    const session = await this.sessionRepository.findOne({
      where: {
        tenantId,
        refreshTokenHash: tokenHash,
        revokedAt: IsNull(),
      },
      relations: ["user"],
    });

    if (!session) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // 3. Check if session expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      await this.sessionRepository.update(session.id, {
        revokedAt: new Date(),
        revokedReason: "expired",
      });
      throw new UnauthorizedException("Session expired");
    }

    // === REUSE DETECTION ===
    // 4. Check if this token was already used
    if (session.lastRefreshAt) {
      // TOKEN REUSE DETECTED!
      // This token was already exchanged for a new one
      // Someone is replaying an old token → security breach

      console.error("🚨 REFRESH TOKEN REUSE DETECTED", {
        sessionId: session.id,
        familyId: session.refreshTokenFamilyId,
        userId: session.userId,
        tenantId: session.tenantId,
      });

      // Revoke entire family
      await this.revokeSessionFamily(session.refreshTokenFamilyId!);

      // Log critical security event
      await this.logSecurityEvent({
        tenantId,
        userId: session.userId,
        eventType: "refresh_token_reuse_detected",
        severity: "critical",
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        metadata: {
          sessionId: session.id,
          familyId: session.refreshTokenFamilyId,
        },
      });

      throw new UnauthorizedException(
        "Token reuse detected - all sessions revoked",
      );
    }

    // === ROTATION ===
    // 5. Generate NEW refresh token
    const newRefreshToken = crypto.randomBytes(32).toString("hex");
    const newRefreshTokenHash = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    // 6. Update session (rotate token, mark as used)
    await this.sessionRepository.update(session.id, {
      refreshTokenHash: newRefreshTokenHash,
      lastRefreshAt: new Date(), // ← Mark this token as used
      lastActivity: new Date(),
    });

    // 7. Generate new access token
    const accessToken = this.jwtService.sign(
      {
        sub: session.userId,
        email: session.user.email,
        tenantId: session.tenantId,
        sessionId: session.id,
      },
      {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: "15m",
      },
    );

    // Log token refresh
    await this.logSecurityEvent({
      tenantId,
      userId: session.userId,
      eventType: "token_refreshed",
      severity: "info",
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      metadata: { sessionId: session.id },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken, // ← Return NEW token
    };
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
   * Revoke all sessions in a token family
   * Used when token reuse is detected
   */
  private async revokeSessionFamily(familyId: string): Promise<void> {
    await this.sessionRepository.update(
      {
        refreshTokenFamilyId: familyId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: "token_reuse_detected",
      },
    );

    console.log(`🔒 Revoked all sessions in family: ${familyId}`);
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
