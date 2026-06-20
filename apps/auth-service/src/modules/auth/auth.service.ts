import type { StringValue } from 'ms';
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull, In } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import {
  User,
  Session,
  Tenant,
  OAuthRefreshToken,
  UserSocialConnection,
  UserRole,
  SecurityEventType,
  TenantSocialProvider,
} from "@repo/database";
import {
  SecurityEventService,
} from "@/common/service/security-event.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { PasswordService } from "@repo/security";
import { EmailService } from "../email/email.service";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { SessionService } from "@/common/service/session.service";
import { BruteForceService } from "@/modules/auth/brute-force.service";
import { MfaService } from "@/modules/mfa/mfa.service";
import { WebAuthnService } from "@/modules/mfa/webauthn.service";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { GetProvidersResponseDto, SocialProviderDto, LoginIntentResponseDto } from "./auth.dto";
import { logger } from "@/common/logger";
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
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(OAuthRefreshToken)
    private readonly oauthRefreshTokenRepository: Repository<OAuthRefreshToken>,
    @InjectRepository(UserSocialConnection)
    private readonly socialConnectionRepository: Repository<UserSocialConnection>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(TenantSocialProvider)
    private readonly tenantSocialProviderRepository: Repository<TenantSocialProvider>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly sessionService: SessionService,
    private readonly bruteForceService: BruteForceService,
    private readonly mfaService: MfaService,
    private readonly webauthnService: WebAuthnService,
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
    private readonly securityEventService: SecurityEventService,
    private readonly jwksService: JwksService,
  ) {}

  private async signToken(payload: Record<string, unknown>, expiresIn: string, tenantId?: string): Promise<string> {
    const { kid, privateKey } = await this.jwksService.getCurrentSigningKey(tenantId);
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    return this.jwtService.sign(payload as Record<string, unknown>, {
      privateKey: privateKeyPem,
      algorithm: 'RS256',
      header: { alg: 'RS256', kid },
      expiresIn: expiresIn as StringValue,
    });
  }

  /**
   * Get role names (groups) for a user within a tenant
   */
  private async getUserGroups(userId: string, tenantId: string): Promise<string[]> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    const userRoles = await this.userRoleRepository.find({
      where: { userId, tenantId },
      relations: ['role'],
    });
    return userRoles.map((ur) => ur.role.name).filter(Boolean);
  }

  /**
   * Build a complete JWT access token payload including groups and tenantSlug
   */
  private async buildAccessTokenPayload(
    userId: string,
    email: string,
    tenantId: string,
    sessionId: string,
    tenant?: Tenant,
  ): Promise<Record<string, unknown>> {
    const [groups, resolvedTenant] = await Promise.all([
      this.getUserGroups(userId, tenantId),
      tenant
        ? Promise.resolve(tenant)
        : this.tenantRepository.findOne({ where: { id: tenantId } }),
    ]);
    return {
      sub: userId,
      email,
      tenantId,
      tenantSlug: resolvedTenant?.slug ?? '',
      groups,
      sessionId,
    };
  }

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
      this.securityEventService.log({
        tenantId: data.tenantId,
        eventType: SecurityEventType.REGISTRATION_FAILED,
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
    this.securityEventService.log({
      userId: savedUser.id,
      tenantId: savedUser.tenantId,
      actorEmail: savedUser.email,
      eventType: SecurityEventType.USER_REGISTERED,
      severity: "info",
      ipAddress: data.ip,
      userAgent: data.userAgent,
      metadata: { email: savedUser.email },
    });

    // Send welcome and verification email
    await this.emailService.sendWelcomeEmail(savedUser, emailVerificationToken);

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
    deviceId?: string;
  }): Promise<
    | { accessToken: string; refreshToken: string; user: { email: string; firstName?: string; lastName?: string; emailVerified: boolean } }
    | {
        mfaRequired: boolean;
        tempToken: string;
        message: string;
        availableMethods: string[];
        preferredMethod: string;
      }
  > {
    const { tenantId, email, password, ip, userAgent } = data;

    // Find user — use QueryBuilder to avoid TypeORM 0.3.x DISTINCT pagination bug
    // with findOne+select(object form)+relations that causes pg "insufficient data" errors
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash") // Force-select the hidden field
      .leftJoinAndSelect("user.tenant", "tenant")
      .where("user.email = :email", { email })
      .andWhere("user.tenantId = :tenantId", { tenantId })
      .getOne();

    logger.info({ email, tenantId, userFound: !!user }, "Login attempt");

    if (!user) {
      this.securityEventService.log({
        tenantId,
        eventType: SecurityEventType.LOGIN_FAILED,
        severity: "critical",
        ipAddress: ip,
        userAgent,
        metadata: { reason: "user_not_found" },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.bruteForceService.checkAccountLock(user);

    logger.info({ userId: user.id, hasPassword: !!user.passwordHash }, "User found");

    if (!user.passwordHash) {
      throw new BadRequestException(
        "Social Provider was used to login. Please use the same or link to this account.",
      );
    }

    // Verify password
    const isValid = await PasswordService.verify(user.passwordHash, password);

    logger.info({ isValid }, "Password check");

    if (!isValid) {
      await this.bruteForceService.recordFailedAttempt(user, tenantId, ip);
      this.securityEventService.log({
        tenantId,
        userId: user.id,
        actorEmail: user.email,
        eventType: SecurityEventType.LOGIN_FAILED,
        severity: "critical",
        ipAddress: ip,
        userAgent,
        // NOTE: `password` is intentionally omitted — sanitizeMetadata strips it
        // anyway, but we never pass sensitive values in the first place.
        metadata: { reason: "invalid_password" },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.bruteForceService.resetFailedAttempts(user);

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

    const mfaStatus = await this.mfaService.getMfaStatus(user.id, tenantId);

    if (mfaStatus.enabled) {
      // Generate temporary token for MFA verification
      const tempToken = await this.signToken(
        {
          sub: user.id,
          email: user.email,
          tenantId,
          type: "mfa_pending",
        },
        "5m",
        tenantId,
      );

      logger.info({ userId: user.id }, "MFA required for user");

      // Log MFA challenge
      this.securityEventService.log({
        tenantId,
        userId: user.id,
        actorEmail: user.email,
        eventType: SecurityEventType.MFA_CHALLENGE_SENT,
        severity: "info",
        ipAddress: ip,
        userAgent,
      });

      return {
        mfaRequired: true,
        tempToken,
        availableMethods: mfaStatus.methods,
        preferredMethod: mfaStatus.preferredMethod || "totp",
        message: "MFA verification required",
      };
    }

    // === REFRESH TOKEN ROTATION LOGIC ===

    // Step 1: Create session
    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId: data.tenantId,
      email: user.email,
      ipAddress: data.ip,
      userAgent: data.userAgent,
      deviceId: data.deviceId,
    });

    logger.info({ sessionId: session.id }, "Session created");

    // Step 2: Create refresh token using OAuthRefreshTokenService
    const { token: refreshToken } =
      await this.oauthRefreshTokenService.createRefreshToken({
        tenantId: data.tenantId,
        userId: user.id,
        sessionId: session.id,
        clientId: undefined, // No client for password login
        ipAddress: data.ip,
        userAgent: data.userAgent,
        deviceId: data.deviceId,
        expiresInDays: 30,
      });

    logger.info("Refresh token created");

    // Step 3: Generate access token (NOW we have sessionId!)
    const accessTokenPayloadData = await this.buildAccessTokenPayload(
      user.id,
      user.email,
      data.tenantId,
      session.id,
      user.tenant,
    );

    console.log({ accessTokenPayloadData }, "Access token payload data");
    const accessToken = await this.signToken(
      accessTokenPayloadData,
      "15m",
      data.tenantId,
    );

    logger.info("Access token generated");

    // Step 4: Log successful login
    this.securityEventService.log({
      tenantId: data.tenantId,
      userId: user.id,
      actorEmail: user.email,
      eventType: SecurityEventType.LOGIN_SUCCESS,
      severity: "info",
      ipAddress: data.ip,
      userAgent: data.userAgent,
      resourceId: session.id,
      resourceType: "session",
      metadata: {
        sessionId: session.id,
        authMethod: "password",
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
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
  async logout(
    tenantId: string,
    userId: string,
    sessionId: string,
    userAgent: string,
    ip: string,
  ): Promise<void> {
    // Revoke session and invalidate refresh token hash so it can never be reused
    await this.sessionRepository.update(
      { id: sessionId, tenantId },
      {
        revokedAt: new Date(),
        revokedReason: "user_logout",
        refreshTokenHash: null as unknown as string,
      },
    );

    // Revoke all refresh tokens for this session
    await this.oauthRefreshTokenService.revokeSessionTokens(
      sessionId,
      tenantId,
      "user_logout",
    );

    // Log logout
    this.securityEventService.log({
      tenantId,
      userId,
      userAgent,
      eventType: SecurityEventType.LOGOUT,
      severity: "info",
      ipAddress: ip,
      resourceId: sessionId,
      resourceType: "session",
      metadata: { sessionId },
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

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        passwordResetToken: otpHash,
        passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    );

    // Log password reset request
    this.securityEventService.log({
      userId: user.id,
      tenantId: user.tenantId,
      actorEmail: user.email,
      eventType: SecurityEventType.PASSWORD_RESET_REQUESTED,
      severity: "info",
      ipAddress: ip,
      userAgent: "system",
    });

    // Send password reset OTP email
    await this.emailService.sendPasswordResetOtpEmail(user, otp);

    // OTP intentionally not logged for security
  }

  /**
   * Send magic link sign-in email (TENANT SCOPED)
   */
  async sendMagicLink(tenantId: string, email: string): Promise<void> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    const user = await this.userRepository.findOne({ where: { email, tenantId } });

    // Don't reveal if user exists
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await this.userRepository.update(
      { id: user.id, tenantId },
      {
        magicLinkToken: tokenHash,
        magicLinkExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    );

    await this.emailService.sendMagicLinkEmail(user, rawToken);

    // Magic link token intentionally not logged for security
  }

  /**
   * Verify magic link token and create session (TENANT SCOPED)
   */
  async verifyMagicLink(
    tenantId: string,
    rawToken: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.magicLinkToken")
      .where("user.magicLinkToken = :tokenHash", { tokenHash })
      .andWhere("user.tenantId = :tenantId", { tenantId })
      .andWhere("user.magicLinkExpiresAt > :now", { now: new Date() })
      .getOne();

    if (!user) {
      throw new UnauthorizedException("Invalid or expired magic link");
    }

    // Clear the token (one-time use)
    await this.userRepository.update(
      { id: user.id, tenantId },
      { magicLinkToken: undefined, magicLinkExpiresAt: undefined },
    );

    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId,
      email: user.email,
      ipAddress: ip,
      userAgent,
    });

    const { token: refreshToken } = await this.oauthRefreshTokenService.createRefreshToken({
      tenantId,
      userId: user.id,
      sessionId: session.id,
      clientId: undefined,
      ipAddress: ip,
      userAgent,
      expiresInDays: 30,
    });

    const magicLinkPayload = await this.buildAccessTokenPayload(user.id, user.email, tenantId, session.id);
    const accessToken = await this.signToken(
      magicLinkPayload,
      "15m",
      tenantId,
    );

    this.securityEventService.log({
      tenantId,
      userId: user.id,
      actorEmail: user.email,
      eventType: SecurityEventType.LOGIN_SUCCESS,
      severity: "info",
      ipAddress: ip,
      userAgent,
      resourceId: session.id,
      resourceType: "session",
      metadata: { authMethod: "magic_link", sessionId: session.id },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Reset password with token (TENANT SCOPED)
   */
  async resetPassword(tenantId: string, otp: string, newPassword: string) {
    const tokenHash = crypto.createHash("sha256").update(otp).digest("hex");

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
    const updatedHistory = [
      ...(user.passwordHash ? [user.passwordHash] : []),
      ...passwordHistory,
    ].slice(0, 5);

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
    this.securityEventService.log({
      userId: user.id,
      tenantId: user.tenantId,
      actorEmail: user.email,
      eventType: SecurityEventType.PASSWORD_RESET_COMPLETED,
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });

    // Send password changed confirmation email
    await this.emailService.sendPasswordChangedEmail(user);

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

    this.securityEventService.log({
      userId: user.id,
      tenantId: user.tenantId,
      actorEmail: user.email,
      eventType: SecurityEventType.EMAIL_VERIFIED,
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

    // Send verification email
    await this.emailService.sendVerificationEmail(user, emailVerificationToken);

    // Verification token intentionally not logged for security
  }

  /**
   * Refresh access token (TENANT SCOPED)
   */
  async refreshToken(
    tenantId: string,
    refreshToken: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Use OAuthRefreshTokenService for rotation
    let accessTokenPayload: Record<string, unknown>;
    let newToken: string;

    try {
      ({ accessTokenPayload, newToken } =
        await this.oauthRefreshTokenService.rotateRefreshToken({
          tenantId,
          token: refreshToken,
          ipAddress: ip,
          userAgent,
        }));
    } catch (err: unknown) {
      this.securityEventService.log({
        tenantId,
        eventType: SecurityEventType.TOKEN_ROTATION_FAILED,
        severity: "warning",
        ipAddress: ip,
        userAgent,
        metadata: {
          reason: err instanceof Error ? err.message : "unknown",
        },
      });
      throw err;
    }

    // Enrich payload with groups and tenantSlug
    const enrichedPayload = await this.buildAccessTokenPayload(
      accessTokenPayload.sub as string,
      accessTokenPayload.email as string,
      accessTokenPayload.tenantId as string,
      accessTokenPayload.sessionId as string,
    );
    // Generate new access token
    const accessToken = await this.signToken(enrichedPayload, "15m", tenantId);

    // Update session: new refresh token hash + expiry + lastUsedAt
    if (accessTokenPayload.sessionId as string) {
      const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const newRefreshTokenHash = crypto
        .createHash("sha256")
        .update(newToken)
        .digest("hex");
      await this.sessionRepository.update(
        { id: accessTokenPayload.sessionId as string, tenantId },
        {
          refreshTokenHash: newRefreshTokenHash,
          refreshExpiresAt: newRefreshExpiresAt,
          lastUsedAt: new Date(),
          lastActivity: new Date(),
        },
      );
    }

    // Log token refresh
    this.securityEventService.log({
      tenantId,
      userId: accessTokenPayload.sub as string,
      eventType: SecurityEventType.TOKEN_REFRESHED,
      severity: "info",
      ipAddress: ip,
      userAgent,
      resourceId: accessTokenPayload.sessionId as string,
      resourceType: "session",
      metadata: {
        sessionId: accessTokenPayload.sessionId as string,
      },
    });

    logger.info({ userId: accessTokenPayload.sub, sessionId: accessTokenPayload.sessionId }, "Token refresh successful");

    return {
      accessToken,
      refreshToken: newToken, // NEW token to client
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
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
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
    const update: Partial<Pick<User, 'failedLoginAttempts' | 'lockedUntil'>> = {
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

    logger.info({ familyId }, "Revoked all sessions in family");
  }

  /**
   * Verify MFA code and complete login
   */
  async verifyMfa(
    tenantId: string,
    tempToken: string,
    code: string,
    ip: string,
    userAgent: string,
  ) {
    // Step 1: Verify temporary token
    const publicKey = await this.jwksService.getPublicKeyForToken(tempToken);
    const payload = this.jwtService.verify(tempToken, {
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
      algorithms: ['RS256'],
    }) as Record<string, unknown>;

    if (payload.type !== "mfa_pending") {
      throw new UnauthorizedException("Invalid token type");
    }

    logger.info({ userId: payload.sub }, "Verifying MFA for user");

    // Step 2: Verify TOTP code
    const verified = await this.mfaService.verifyTotp(
      payload.sub as string,
      tenantId,
      code,
    );

    if (!verified) {
      throw new UnauthorizedException("Invalid MFA code");
    }

    // Step 3: Generate real session and tokens
    const familyId = uuidv4();
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const session = await this.sessionService.createSession({
      userId: payload.sub as string,
      tenantId,
      email: payload.email as string,
      refreshTokenFamilyId: familyId,
      refreshTokenHash,
      ipAddress: ip,
      userAgent: userAgent || "unknown",
    });

    const mfaPayload = await this.buildAccessTokenPayload(payload.sub as string, payload.email as string, tenantId, session.id);
    const accessToken = await this.signToken(mfaPayload, "15m", tenantId);

    logger.info({ userId: payload.sub }, "MFA verified successfully");

    return {
      accessToken,
      refreshToken,
      message: "MFA verified successfully",
    };
  }

  /**
   * Verify MFA using backup code
   */
  async verifyMfaBackup(
    tenantId: string,
    tempToken: string,
    code: string,
    ip: string,
    userAgent: string,
  ) {
    // Step 1: Verify temporary token
    const publicKey = await this.jwksService.getPublicKeyForToken(tempToken);
    const payload = this.jwtService.verify(tempToken, {
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
      algorithms: ['RS256'],
    }) as Record<string, unknown>;

    if (payload.type !== "mfa_pending") {
      throw new UnauthorizedException("Invalid token type");
    }

    logger.info({ userId: payload.sub }, "Verifying backup code for user");

    // Step 2: Verify backup code
    const verified = await this.mfaService.verifyBackupCode(
      payload.sub as string,
      tenantId,
      code,
    );

    if (!verified) {
      throw new UnauthorizedException("Invalid backup code");
    }

    // Step 3: Generate real session and tokens
    const familyId = uuidv4();
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const session = await this.sessionService.createSession({
      userId: payload.sub as string,
      tenantId,
      email: payload.email as string,
      refreshTokenFamilyId: familyId,
      refreshTokenHash,
      ipAddress: ip,
      userAgent: userAgent || "unknown",
    });

    const backupPayload = await this.buildAccessTokenPayload(payload.sub as string, payload.email as string, tenantId, session.id);
    const accessToken = await this.signToken(backupPayload, "15m", tenantId);

    logger.info({ userId: payload.sub }, "Backup code verified");

    // Check remaining backup codes
    const mfaStatus = await this.mfaService.getMfaStatus(payload.sub as string, tenantId);
    const remaining = mfaStatus.backupCodesRemaining as number;

    return {
      accessToken,
      refreshToken,
      message: "Backup code verified successfully",
      warning:
        remaining <= 2
          ? `⚠️ Only ${remaining} backup codes remaining. Please regenerate new codes.`
          : undefined,
    };
  }

  // apps/auth-service/src/modules/auth/auth.service.ts
  // ADD THESE METHODS TO AuthService

  /**
   * Start WebAuthn authentication (passwordless login).
   *
   * Returns WebAuthn options AND an opaque sessionNonce. The client must echo
   * the nonce back when calling finishWebAuthnLogin so the server can retrieve
   * the single-use challenge from Redis.
   */
  async startWebAuthnLogin(
    tenantId: string,
    email: string,
  ): Promise<{ sessionNonce: string; [key: string]: unknown }> {
    // Find user
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    const user = await this.userRepository.findOne({
      where: { email, tenantId },
    });

    if (!user) {
      // Don't reveal if user exists
      throw new UnauthorizedException("Invalid credentials");
    }

    // Generate authentication options via WebAuthnService (returns options + nonce)
    const { options, sessionNonce } = await this.webauthnService.startAuthentication(
      user.id,
      tenantId,
    );

    logger.info({ email }, "WebAuthn login started");

    // Spread options so the response shape is flat: { sessionNonce, challenge, ... }
    return { ...options, sessionNonce };
  }

  /**
   * Finish WebAuthn authentication and create session.
   *
   * @param data.sessionNonce - Opaque nonce returned by startWebAuthnLogin();
   *                            required to retrieve the single-use challenge.
   */
  async finishWebAuthnLogin(data: {
    tenantId: string;
    email: string;
    webauthnResponse: AuthenticationResponseJSON;
    sessionNonce: string;
    ip: string;
    userAgent: string;
    deviceId?: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: { email: string; firstName?: string; lastName?: string; emailVerified: boolean } }> {
    const { tenantId, email, webauthnResponse, sessionNonce, ip, userAgent, deviceId } = data;

    // Find user
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    const user = await this.userRepository.findOne({
      where: { email, tenantId },
      relations: ["tenant"],
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Verify WebAuthn response (passes nonce so service can look up challenge)
    const verified = await this.webauthnService.finishAuthentication(
      user.id,
      tenantId,
      webauthnResponse,
      sessionNonce,
    );

    if (!verified) {
      this.securityEventService.log({
        tenantId,
        userId: user.id,
        actorEmail: user.email,
        eventType: SecurityEventType.PASSKEY_AUTH_FAILED,
        severity: "warning",
        ipAddress: ip,
        userAgent,
        metadata: { reason: "webauthn_verification_failed" },
      });

      throw new UnauthorizedException("WebAuthn verification failed");
    }

    // Check if account is active
    if (!user.isActive) {
      throw new UnauthorizedException("Account is disabled");
    }

    // Create session using SessionService (consistent with password login)
    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId,
      email: user.email,
      ipAddress: ip,
      userAgent,
      deviceId,
    });

    const { token: refreshToken } = await this.oauthRefreshTokenService.createRefreshToken({
      tenantId,
      userId: user.id,
      sessionId: session.id,
      clientId: undefined,
      ipAddress: ip,
      userAgent,
      deviceId,
      expiresInDays: 30,
    });

    const passkeyPayload = await this.buildAccessTokenPayload(user.id, user.email, tenantId, session.id);
    const accessToken = await this.signToken(passkeyPayload, "15m", tenantId);

    // Log successful passkey login
    this.securityEventService.log({
      tenantId,
      userId: user.id,
      actorEmail: user.email,
      eventType: SecurityEventType.PASSKEY_AUTH_SUCCESS,
      severity: "info",
      ipAddress: ip,
      userAgent,
      resourceId: session.id,
      resourceType: "session",
      metadata: { sessionId: session.id, authMethod: "webauthn" },
    });

    logger.info({ userId: user.id }, "WebAuthn login successful");

    return {
      accessToken,
      refreshToken,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Get login intent - what auth methods are available for this email
   */
  async getLoginIntent(
    email: string,
    tenantId: string,
  ): Promise<LoginIntentResponseDto> {
    // Get tenant first
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Find user
    const user = await this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect('user.mfaSettings', 'mfa')
      .where("user.email = :email", { email })
      .andWhere("user.tenantId = :tenantId", { tenantId })
      .select([
        "user.id",
        "user.email",
        "user.passwordHash",
        "user.emailVerified",
        "user.mfaEnabled",
        "user.preferredAuthMethod",
        "user.primaryAuthMethod",

        // everything from MFA
        "mfa",
      ])
      .getOne();

    // User doesn't exist - return signup options
    if (!user) {
      return this.getSignupIntent(email, tenant);
    }

    // User exists - return login options
    return this.getUserLoginIntent(user, tenant, tenantId);
  }

  /**
   * Get signup intent for new users
   */
  private getSignupIntent(email: string, tenant: Tenant): LoginIntentResponseDto {
    const allowSignup = tenant.settings?.allowSignup ?? true;

    if (!allowSignup) {
      return {
        exists: false,
        email,
        methods: {
          password: false,
          magicLink: false,
          passkey: false,
          mfa: false,
          social: [],
        },
      };
    }

    // Signup allowed
    return {
      exists: false,
      email,
      methods: {
        password: true, // Always allow password signup
        magicLink: tenant.featureFlags?.['magicLinkEnabled'] ?? false,
        passkey: tenant.featureFlags?.['passkeyEnabled'] ?? false,
        mfa: false, // No MFA for new users
        social: this.getEnabledSocialProviders(tenant),
      },
      preferredMethod: 'password', // Default for signup
      branding: tenant.branding,
    };
  }

  /**
   * Get login intent for existing user
   */
  private async getUserLoginIntent(
    user: User,
    tenant: Tenant,
    tenantId: string,
  ): Promise<LoginIntentResponseDto> {
    // Get user's linked social accounts
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    const socialConnections = await this.socialConnectionRepository.find({
      where: { userId: user.id, tenantId },
      select: ['provider'],
    });

    const linkedProviders = socialConnections.map((sc) => sc.provider);

    const methods = {
      // Password: User has set a password
      password: !!user.passwordHash,

      // Magic Link: Tenant enabled + email verified (or verification not required)
      magicLink:
        (tenant.featureFlags?.['magicLinkEnabled'] ?? false) &&
        (user.emailVerified || !(tenant.settings?.requireEmailVerification ?? false)),

      // Passkey: Would need to check webauthn_credentials table (not in current schema)
      // For now, set to false
      passkey: tenant.featureFlags?.['passkeyEnabled'] ?? false,

      // MFA: User has enabled MFA
      mfa: user.mfaEnabled ?? false,

      // Social: Providers that are both enabled AND linked
      social: this.getAvailableSocialProviders(tenant, linkedProviders),
    };

    const preferredMethod =
      (user.preferredAuthMethod as 'password' | 'magicLink' | 'passkey' | 'social' | undefined) ||
      this.determineDefaultMethod(methods);

    return {
      exists: true,
      email: user.email,
      methods,
      preferredMethod,
      branding: tenant.branding,
    };
  }

  /**
   * Get social providers enabled by tenant
   */
  private getEnabledSocialProviders(tenant: Tenant): string[] {
    // Check feature flags for individual providers
    const providers: string[] = [];

    if (tenant.featureFlags?.['googleEnabled']) providers.push('google');
    if (tenant.featureFlags?.['githubEnabled']) providers.push('github');
    if (tenant.featureFlags?.['microsoftEnabled']) providers.push('microsoft');
    if (tenant.featureFlags?.['appleEnabled']) providers.push('apple');
    if (tenant.featureFlags?.['linkedinEnabled']) providers.push('linkedin');
    if (tenant.featureFlags?.['facebookEnabled']) providers.push('facebook');

    return providers;
  }

  /**
   * Get social providers available for user
   * (Must be both enabled by tenant AND linked to user)
   */
  private getAvailableSocialProviders(
    tenant: Tenant,
    linkedProviders: string[],
  ): string[] {
    const enabledProviders = this.getEnabledSocialProviders(tenant);

    // Return intersection of enabled and linked
    return enabledProviders.filter((provider) =>
      linkedProviders.includes(provider),
    );
  }

  /**
   * Determine smart default method
   * Priority: Passkey > Magic Link > Social > Password
   */
  private determineDefaultMethod(methods: {
    password: boolean;
    magicLink: boolean;
    passkey: boolean;
    social: string[];
  }): 'password' | 'magicLink' | 'passkey' | 'social' {
    if (methods.passkey) return 'passkey';
    if (methods.magicLink) return 'magicLink';
    if (methods.social.length > 0) return 'social';
    return 'password';
  }

  /**
   * Check if method requires MFA
   * Only password-based login requires additional MFA
   */
  requiresMFA(method: string, user: User): boolean {
    // Magic link = email access (inherently 2FA)
    if (method === 'magicLink') return false;

    // Passkey = biometric + device (inherently 2FA)
    if (method === 'passkey') return false;

    // Social = trusted provider (verified identity)
    if (method === 'social') return false;

    // Password = only if user has MFA enabled
    if (method === 'password') {
      return user.mfaEnabled ?? false;
    }

    return false;
  }

  /**
   * Get enabled authentication providers for a tenant without requiring an email.
   * Used by the frontend to decide which login options to render before email entry.
   *
   * Social providers are returned from the tenant_social_providers table (enabled rows).
   * Falls back to feature-flag approach when no rows exist yet for a provider.
   */
  async getProviders(tenantId: string): Promise<GetProvidersResponseDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });

    if (!tenant) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException('Tenant not found');
    }

    // Query the dedicated tenant_social_providers table for explicitly configured providers
    const configuredProviders = await this.tenantSocialProviderRepository.find({
      where: { tenantId },
      select: ['provider', 'enabled'],
    });

    let social: SocialProviderDto[];

    if (configuredProviders.length > 0) {
      // Use the dedicated table as source of truth
      social = configuredProviders.map((p) => ({
        provider: p.provider,
        enabled: p.enabled,
        displayName: this.getProviderDisplayName(p.provider),
      }));
    } else {
      // Fall back to feature flags on the tenant record
      social = this.getEnabledSocialProviders(tenant).map((provider) => ({
        provider,
        enabled: true,
        displayName: this.getProviderDisplayName(provider),
      }));
    }

    return {
      password: true, // Password is always available unless tenant explicitly disables it
      magicLink: tenant.featureFlags?.['magicLinkEnabled'] ?? false,
      passkey: tenant.featureFlags?.['passkeyEnabled'] ?? false,
      social,
    };
  }

  /**
   * Map a provider identifier to a human-readable display name.
   */
  private getProviderDisplayName(provider: string): string {
    const displayNames: Record<string, string> = {
      google: 'Google',
      github: 'GitHub',
      microsoft: 'Microsoft',
      apple: 'Apple',
      linkedin: 'LinkedIn',
      facebook: 'Facebook',
    };
    return displayNames[provider] ?? provider;
  }

}

