import { randomUUID } from "crypto";
import type { StringValue } from 'ms';
import { HttpException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull, In } from "typeorm";
import { SessionRepository } from "@/core/database/session.repository";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import {
  User,
  Tenant,
  OAuthRefreshToken,
  UserSocialConnection,
  UserRole,
  SecurityEventType,
  TenantSocialProvider,
  UserInvite,
} from "@repo/database";
import {
  SecurityEventService,
} from "@/common/service/security-event.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { EmailService } from "../email/email.service";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { RedisService } from "@/common/service/redis.service";
import { SessionService } from "@/common/service/session.service";
import { BruteForceService } from "@/modules/auth/brute-force.service";
import { MfaService } from "@/modules/mfa/mfa.service";
import { MfaPolicyService } from "@/modules/mfa/mfa-policy.service";
import { WebAuthnService } from "@/modules/mfa/webauthn.service";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { GetProvidersResponseDto, SocialProviderDto, LoginIntentResponseDto } from "./auth.dto";
import { logger } from "@/common/logger";
import { ApiException } from "@/common/http";
import {
  DomainEventName,
  DomainEventsService,
} from "@/common/service/domain-events.service";
import { PasswordChangeEffectsService } from "@/common/service/password-change-effects.service";
import { LoginThrottleService } from "./login-throttle.service";
import { assertPasswordPolicy } from "./password-policy";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password-hashing";
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
const PASSWORD_RESET_OTP_LENGTH = 6;
const PASSWORD_RESET_TTL_SECONDS = 15 * 60;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

/**
 * Non-secret session metadata returned alongside (never instead of) the
 * httpOnly auth cookies, so clients can read tenant/group context without
 * ever holding the signed access token. See docs/adr/0003-access-token-delivery.md.
 */
export interface SessionClaims {
  tenantId: string;
  tenantSlug: string;
  groups: string[];
}
const PASSWORD_RESET_ATTEMPTS_RESOURCE = "pwreset-attempts";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly sessionRepository: SessionRepository,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(OAuthRefreshToken)
    private readonly oauthRefreshTokenRepository: Repository<OAuthRefreshToken>,
    @InjectRepository(UserSocialConnection)
    private readonly socialConnectionRepository: Repository<UserSocialConnection>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(UserInvite)
    private readonly userInviteRepository: Repository<UserInvite>,
    @InjectRepository(TenantSocialProvider)
    private readonly tenantSocialProviderRepository: Repository<TenantSocialProvider>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly sessionService: SessionService,
    private readonly bruteForceService: BruteForceService,
    private readonly mfaService: MfaService,
    private readonly mfaPolicyService: MfaPolicyService,
    private readonly webauthnService: WebAuthnService,
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
    private readonly securityEventService: SecurityEventService,
    private readonly jwksService: JwksService,
    private readonly redisService: RedisService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly domainEvents: DomainEventsService,
    private readonly passwordEffects: PasswordChangeEffectsService,
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
    authTime: number = Math.floor(Date.now() / 1000),
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
      // Epoch seconds of the login this session started with; RecentAuthGuard
      // compares it to RECENT_AUTH_WINDOW_SECONDS for sensitive actions.
      authTime,
    };
  }

  /**
   * Non-secret session metadata for clients that need it without ever holding
   * the signed access token (see docs/adr/0003-access-token-delivery.md).
   * These are the same claims the JWT payload already carries in plaintext —
   * exposing them here is not a new disclosure, it just removes the need for
   * the client to hold the credential itself to read them.
   */
  private toSessionClaims(payload: Record<string, unknown>): SessionClaims {
    return {
      tenantId: payload.tenantId as string,
      tenantSlug: (payload.tenantSlug as string) ?? '',
      groups: (payload.groups as string[]) ?? [],
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
      throw new ApiException("TENANT_NOT_FOUND");
    }

    assertPasswordPolicy(data.password, { email: data.email });

    // Hash before looking the email up so a taken email costs the same time
    // as a free one.
    const passwordHash = await hashPassword(data.password);

    // Check if user already exists IN THIS TENANT
    const existingUser = await this.userRepository.findOne({
      where: {
        email: data.email,
        tenantId: data.tenantId, // ← Tenant-scoped lookup
      },
    });

    // Same response whether or not the email is taken, so registration cannot
    // be used to discover which emails have accounts.
    const response = {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      message:
        "Registration successful. Please check your email to verify your account.",
    };

    if (existingUser) {
      // Log failed registration attempt (tenant-scoped)
      this.securityEventService.log({
        tenantId: data.tenantId,
        userId: existingUser.id,
        eventType: SecurityEventType.REGISTRATION_FAILED,
        severity: "warning",
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: { reason: "email_exists" },
      });

      return response;
    }

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
      metadata: {},
    });

    // Send welcome and verification email
    await this.emailService.sendWelcomeEmail(savedUser, emailVerificationToken);

    return response;
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
    | { accessToken: string; refreshToken: string; tenantSlug: string; session: SessionClaims; user: { email: string; firstName?: string; lastName?: string; emailVerified: boolean } }
    | { mfaRequired: boolean; tempToken: string; message: string; availableMethods: string[]; preferredMethod: string }
    | { status: 'mfa_enrollment_required'; enrollmentToken: string }
  > {
    const { tenantId, email, password, ip, userAgent } = data;

    // Charge the attempt before anything slow runs (parallel guesses must not
    // all slip past a check-then-record gap). A blocked attempt is answered
    // exactly like a wrong password.
    const { blocked } = await this.loginThrottle.charge(tenantId, email, ip);

    // Find user — use QueryBuilder to avoid TypeORM 0.3.x DISTINCT pagination bug
    // with findOne+select(object form)+relations that causes pg "insufficient data" errors
    const user = blocked
      ? null
      : await this.userRepository
          .createQueryBuilder("user")
          .addSelect("user.passwordHash") // Force-select the hidden field
          .leftJoinAndSelect("user.tenant", "tenant")
          .where("user.email = :email", { email })
          .andWhere("user.tenantId = :tenantId", { tenantId })
          .getOne();

    if (user) {
      // An expired lock must not leave a stale failure counter behind.
      await this.bruteForceService.clearExpiredLock(user);
    }

    // Unknown email, passwordless (social-only) account and throttled attempts
    // all pay for one Argon2 verification so timing reveals nothing.
    const isValid = user?.passwordHash
      ? await verifyPassword(user.passwordHash, password)
      : await verifyAgainstDummy(password);

    if (!user || !isValid) {
      return this.rejectLogin(user, { tenantId, ip, userAgent }, blocked ? "throttled" : user ? "invalid_password" : "user_not_found");
    }

    // Only someone who knows the password learns the account is locked.
    await this.bruteForceService.checkAccountLock(user);
    await this.loginThrottle.refund(tenantId, email);
    await this.bruteForceService.resetFailedAttempts(user);

    // Check if email verified (if required)
    if (
      !user.emailVerified &&
      user.tenant.featureFlags?.emailVerificationRequired
    ) {
      throw new ApiException("AUTH_EMAIL_NOT_VERIFIED");
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
          // Identifies this MFA challenge so wrong codes can be counted per challenge.
          jti: randomUUID(),
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

    // Check if tenant MFA policy requires enrollment for this user
    if (!mfaStatus.enabled) {
      const mfaPolicy = await this.mfaPolicyService.getForTenant(tenantId);
      const needsEnrollment =
        mfaPolicy.enforceForAllUsers ||
        (mfaPolicy.enforceForAdmins &&
          (await this.userRoleRepository.find({ where: { userId: user.id, tenantId }, relations: ['role'] }))
            .some((ur) => ['owner', 'admin'].includes(ur.role?.name?.toLowerCase() ?? '')));

      if (needsEnrollment) {
        return {
          status: 'mfa_enrollment_required',
          enrollmentToken: await this.mfaPolicyService.issueEnrollmentToken(user.id, tenantId),
        };
      }
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
      tenantSlug: user.tenant?.slug ?? '',
      session: this.toSessionClaims(accessTokenPayloadData),
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Single exit for every failed password login. Records the failure against
   * the account when there is one (and it is not already locked), then answers
   * with the same AUTH_INVALID_CREDENTIALS whatever the reason.
   */
  private async rejectLogin(
    user: User | null,
    ctx: { tenantId: string; ip: string; userAgent: string },
    reason: "throttled" | "invalid_password" | "user_not_found",
  ): Promise<never> {
    this.securityEventService.log({
      tenantId: ctx.tenantId,
      userId: user?.id,
      actorEmail: user?.email,
      eventType: SecurityEventType.LOGIN_FAILED,
      severity: reason === "throttled" ? "warning" : "critical",
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      // NOTE: `password` is intentionally omitted — never pass sensitive values.
      outcome: "failure",
      metadata: { reason },
    });

    if (user && reason === "invalid_password" && !this.bruteForceService.isLocked(user)) {
      // Throws AUTH_INVALID_CREDENTIALS after counting the failure / locking.
      await this.bruteForceService.recordFailedAttempt(user, ctx.tenantId, ctx.ip);
    }
    throw new ApiException("AUTH_INVALID_CREDENTIALS");
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

    // Generate OTP with a CSPRNG (was Math.random)
    const otp = crypto
      .randomInt(0, 10 ** PASSWORD_RESET_OTP_LENGTH)
      .toString()
      .padStart(PASSWORD_RESET_OTP_LENGTH, "0");
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    // A new code resets the attempt budget
    await this.redisService.delete(tenantId, PASSWORD_RESET_ATTEMPTS_RESOURCE, user.id);

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        passwordResetToken: otpHash,
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000),
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
  ): Promise<
    | { accessToken: string; refreshToken: string; tenantSlug: string; session: SessionClaims }
    | { status: 'mfa_enrollment_required'; enrollmentToken: string }
  > {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.magicLinkToken")
      .where("user.magicLinkToken = :tokenHash", { tokenHash })
      .andWhere("user.tenantId = :tenantId", { tenantId })
      .andWhere("user.magicLinkExpiresAt > :now", { now: new Date() })
      .getOne();

    if (!user) {
      throw new ApiException("AUTH_TOKEN_INVALID");
    }

    // Clear the token (one-time use) and mark email as verified
    await this.userRepository.update(
      { id: user.id, tenantId },
      { magicLinkToken: undefined, magicLinkExpiresAt: undefined, emailVerified: true },
    );

    // MFA enrollment enforcement: check policy AFTER credential verification but BEFORE session
    const magicLinkMfaStatus = await this.mfaService.getMfaStatus(user.id, tenantId);
    if (!magicLinkMfaStatus.enabled) {
      const mfaPolicy = await this.mfaPolicyService.getForTenant(tenantId);
      const needsEnrollment =
        mfaPolicy.enforceForAllUsers ||
        (mfaPolicy.enforceForAdmins &&
          (await this.userRoleRepository.find({ where: { userId: user.id, tenantId }, relations: ['role'] }))
            .some((ur) => ['owner', 'admin'].includes(ur.role?.name?.toLowerCase() ?? '')));

      if (needsEnrollment) {
        return {
          status: 'mfa_enrollment_required' as const,
          enrollmentToken: await this.mfaPolicyService.issueEnrollmentToken(user.id, tenantId),
        };
      }
    }

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

    return {
      accessToken,
      refreshToken,
      tenantSlug: (magicLinkPayload.tenantSlug as string) ?? '',
      session: this.toSessionClaims(magicLinkPayload),
    };
  }

  /**
   * Reset password with token (TENANT SCOPED)
   */
  async resetPassword(
    tenantId: string,
    email: string,
    otp: string,
    newPassword: string,
    ipAddress = "0.0.0.0",
    meta: { userAgent?: string; requestId?: string } = {},
  ) {
    // The code is bound to ONE account (tenant + email). Looking users up by
    // code alone let an attacker brute-force the 6-digit space and reset the
    // password of whichever user had an outstanding code.
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordResetToken")
      .addSelect("user.passwordHash")
      .addSelect("user.passwordHistory")
      .where("user.tenantId = :tenantId", { tenantId }) // ← Tenant filter
      .andWhere("LOWER(user.email) = LOWER(:email)", { email })
      .getOne();

    const invalid = () => new ApiException("AUTH_OTP_INVALID");

    if (
      !user ||
      !user.passwordResetToken ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt <= new Date()
    ) {
      throw invalid();
    }

    // Per-account attempt budget. Exceeding it burns the code, so guessing
    // is capped at PASSWORD_RESET_MAX_ATTEMPTS tries per issued code.
    const attempts = await this.redisService.incr(
      tenantId,
      PASSWORD_RESET_ATTEMPTS_RESOURCE,
      user.id,
    );
    if (attempts === 1) {
      await this.redisService.extendTTL(
        tenantId,
        PASSWORD_RESET_ATTEMPTS_RESOURCE,
        user.id,
        PASSWORD_RESET_TTL_SECONDS,
      );
    }
    if (attempts > PASSWORD_RESET_MAX_ATTEMPTS) {
      await this.userRepository.update(
        { id: user.id, tenantId },
        { passwordResetToken: null as unknown as string, passwordResetExpiresAt: null as unknown as Date },
      );
      await this.redisService.delete(tenantId, PASSWORD_RESET_ATTEMPTS_RESOURCE, user.id);
      this.securityEventService.log({
        userId: user.id,
        tenantId,
        actorEmail: user.email,
        eventType: SecurityEventType.BRUTE_FORCE_THRESHOLD,
        severity: "warning",
        ipAddress,
        userAgent: "system",
        metadata: { flow: "password_reset", attempts },
      });
      throw invalid();
    }

    const presented = crypto.createHash("sha256").update(otp).digest();
    const stored = Buffer.from(user.passwordResetToken, "hex");
    if (stored.length !== presented.length || !crypto.timingSafeEqual(stored, presented)) {
      throw invalid();
    }

    assertPasswordPolicy(newPassword, { email: user.email });

    // Check password history
    const passwordHistory = user.passwordHistory || [];
    for (const oldHash of passwordHistory) {
      const isReused = await verifyPassword(oldHash, newPassword);
      if (isReused) {
        throw new ApiException("PASSWORD_POLICY", {
          errors: [
            {
              field: "password",
              message: "Password has been used recently. Please choose a different password.",
            },
          ],
        });
      }
    }

    const newPasswordHash = await hashPassword(newPassword);

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
        // `undefined` is skipped by TypeORM's update(); null actually clears
        // the columns so the code cannot be replayed.
        passwordResetToken: null as unknown as string,
        passwordResetExpiresAt: null as unknown as Date,
      },
    );
    await this.redisService.delete(tenantId, PASSWORD_RESET_ATTEMPTS_RESOURCE, user.id);

    // Revoke every session and refresh token IN THIS TENANT (force re-login),
    // record the event with the request id and email the owner.
    await this.passwordEffects.afterPasswordChange({
      user,
      ip: ipAddress,
      userAgent: meta.userAgent ?? "unknown",
      requestId: meta.requestId,
      reason: "password_reset",
      eventType: SecurityEventType.PASSWORD_RESET_COMPLETED,
    });
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
      throw new ApiException("AUTH_TOKEN_INVALID");
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

    // Silent, like an unknown email: the response must not say which it is.
    if (user.emailVerified) {
      return;
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
    requestId?: string,
  ): Promise<{ accessToken: string; refreshToken: string; tenantSlug: string; session: SessionClaims }> {
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
      if (this.isRefreshReuse(err)) {
        await this.publishRefreshReuse(tenantId, refreshToken, ip, requestId);
      }
      throw err;
    }

    // Refreshing is not re-authenticating: keep the original login time.
    const loginSession = await this.sessionRepository.findOne({
      where: { id: accessTokenPayload.sessionId as string, tenantId },
      select: { id: true, createdAt: true },
    });

    // Enrich payload with groups and tenantSlug
    const enrichedPayload = await this.buildAccessTokenPayload(
      accessTokenPayload.sub as string,
      accessTokenPayload.email as string,
      accessTokenPayload.tenantId as string,
      accessTokenPayload.sessionId as string,
      undefined,
      loginSession ? Math.floor(loginSession.createdAt.getTime() / 1000) : 0,
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
      refreshToken: newToken,
      tenantSlug: (enrichedPayload.tenantSlug as string) ?? '',
      session: this.toSessionClaims(enrichedPayload),
    };
  }

  private isRefreshReuse(err: unknown): boolean {
    if (err instanceof ApiException) return err.code === "AUTH_REFRESH_REUSED";
    return err instanceof HttpException && /reuse detected/i.test(err.message);
  }

  /**
   * Tells the account owner a rotated-out refresh token was replayed (the
   * family has already been revoked by the rotation service). Never throws:
   * the caller must still answer with the original refresh failure.
   */
  private async publishRefreshReuse(
    tenantId: string,
    presentedToken: string,
    ip: string,
    requestId?: string,
  ): Promise<void> {
    try {
      const tokenHash = crypto.createHash("sha256").update(presentedToken).digest("hex");
      const stored = await this.oauthRefreshTokenRepository.findOne({
        where: { tenantId, tokenHash },
        select: { id: true, userId: true },
      });
      if (!stored) return;
      const user = await this.userRepository.findOne({
        where: { id: stored.userId, tenantId },
        relations: ["tenant"],
      });
      if (!user) return;
      this.domainEvents.publish(DomainEventName.SESSION_REFRESH_REUSE_DETECTED, {
        tenantId,
        userId: user.id,
        email: user.email,
        name: user.firstName || undefined,
        tenantName: user.tenant?.name,
        ip,
        requestId,
      });
    } catch (err: unknown) {
      logger.error({ err }, "Failed to publish refresh reuse event");
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
      throw new ApiException("RESOURCE_NOT_FOUND");
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

  /** Verifies the short-lived mfa_pending token issued after the password step. */
  private async verifyMfaTempToken(tempToken: string): Promise<Record<string, unknown>> {
    let payload: Record<string, unknown>;
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(tempToken);
      payload = this.jwtService.verify(tempToken, {
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
        algorithms: ['RS256'],
      }) as Record<string, unknown>;
    } catch (err: unknown) {
      throw new ApiException(
        err instanceof Error && err.name === "TokenExpiredError"
          ? "AUTH_TOKEN_EXPIRED"
          : "AUTH_TOKEN_INVALID",
      );
    }
    if (payload.type !== "mfa_pending") {
      throw new ApiException("AUTH_TOKEN_INVALID");
    }
    return payload;
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
    const payload = await this.verifyMfaTempToken(tempToken);

    logger.info({ userId: payload.sub }, "Verifying MFA for user");

    // Step 2: Verify TOTP code
    const verified = await this.mfaService.verifyTotp(
      payload.sub as string,
      tenantId,
      code,
      typeof payload.jti === "string" ? payload.jti : undefined,
    );

    if (!verified) {
      throw new ApiException("AUTH_MFA_INVALID");
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
      tenantSlug: (mfaPayload.tenantSlug as string) ?? '',
      session: this.toSessionClaims(mfaPayload),
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
    const payload = await this.verifyMfaTempToken(tempToken);

    logger.info({ userId: payload.sub }, "Verifying backup code for user");

    // Step 2: Verify backup code
    const verified = await this.mfaService.verifyBackupCode(
      payload.sub as string,
      tenantId,
      code,
      typeof payload.jti === "string" ? payload.jti : undefined,
    );

    if (!verified) {
      throw new ApiException("AUTH_MFA_INVALID");
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
      tenantSlug: (backupPayload.tenantSlug as string) ?? '',
      session: this.toSessionClaims(backupPayload),
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
      throw new ApiException("AUTH_INVALID_CREDENTIALS");
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
  }): Promise<
    | { accessToken: string; refreshToken: string; tenantSlug: string; session: SessionClaims; user: { email: string; firstName?: string; lastName?: string; emailVerified: boolean } }
    | { status: 'mfa_enrollment_required'; enrollmentToken: string }
  > {
    const { tenantId, email, webauthnResponse, sessionNonce, ip, userAgent, deviceId } = data;

    // Find user
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    const user = await this.userRepository.findOne({
      where: { email, tenantId },
      relations: ["tenant"],
    });

    if (!user) {
      throw new ApiException("AUTH_INVALID_CREDENTIALS");
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

      throw new ApiException("PASSKEY_INVALID");
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ApiException("USER_SUSPENDED");
    }

    // MFA enforcement: check before issuing session
    const passkeyMfaStatus = await this.mfaService.getMfaStatus(user.id, tenantId);
    if (!passkeyMfaStatus.enabled) {
      const mfaPolicy = await this.mfaPolicyService.getForTenant(tenantId);
      const needsEnrollment =
        mfaPolicy.enforceForAllUsers ||
        (mfaPolicy.enforceForAdmins &&
          (await this.userRoleRepository.find({ where: { userId: user.id, tenantId }, relations: ['role'] }))
            .some((ur) => ['owner', 'admin'].includes(ur.role?.name?.toLowerCase() ?? '')));

      if (needsEnrollment) {
        return {
          status: 'mfa_enrollment_required' as const,
          enrollmentToken: await this.mfaPolicyService.issueEnrollmentToken(user.id, tenantId),
        };
      }
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
      tenantSlug: user.tenant?.slug ?? '',
      session: this.toSessionClaims(passkeyPayload),
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
      throw new ApiException("TENANT_NOT_FOUND");
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

      // Magic Link: Tenant enabled
      magicLink: tenant.featureFlags?.['magicLinkEnabled'] ?? false,

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
      throw new ApiException("TENANT_NOT_FOUND");
    }

    // Query the dedicated tenant_social_providers table for explicitly configured providers
    const configuredProviders = await this.tenantSocialProviderRepository.find({
      where: { tenantId },
      select: ['provider', 'enabled'],
    });

    let social: SocialProviderDto[];

    // Only show providers explicitly configured in tenant_social_providers.
    // No fallback to featureFlags — unconfigured tenants show no social buttons.
    social = configuredProviders
      .filter((p) => p.enabled)
      .map((p) => ({
        provider: p.provider,
        enabled: p.enabled,
        displayName: this.getProviderDisplayName(p.provider),
      }));

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

  /**
   * Validate an invite token — returns invite metadata for the accept form.
   * Public endpoint (no auth required).
   */
  async validateInvite(token: string): Promise<{
    email: string;
    tenantName: string;
    tenantSlug: string;
  }> {
    const invite = await this.userInviteRepository.findOne({
      where: { token },
      relations: ['tenant'],
    });

    if (!invite) {
      throw new ApiException("INVITE_INVALID");
    }
    if (invite.acceptedAt) {
      throw new ApiException("INVITE_INVALID", { detail: "This invitation has already been used." });
    }
    if (invite.expiresAt < new Date()) {
      throw new ApiException("INVITE_INVALID", { detail: "This invitation has expired." });
    }

    return {
      email: invite.email,
      tenantName: invite.tenant?.name ?? '',
      tenantSlug: invite.tenant?.slug ?? '',
    };
  }

  /**
   * Accept an invite — creates the user account and assigns roles.
   * Public endpoint (no auth required).
   */
  async acceptInvite(data: {
    token: string;
    name: string;
    password: string;
    ip: string;
    userAgent: string;
  }): Promise<{ message: string }> {
    const invite = await this.userInviteRepository.findOne({
      where: { token: data.token },
      relations: ['tenant'],
    });

    if (!invite) {
      throw new ApiException("INVITE_INVALID");
    }
    if (invite.acceptedAt) {
      throw new ApiException("INVITE_INVALID", { detail: "This invitation has already been used." });
    }
    if (invite.expiresAt < new Date()) {
      throw new ApiException("INVITE_INVALID", { detail: "This invitation has expired." });
    }

    const tenant = invite.tenant;
    if (!tenant || !tenant.active) {
      throw new ApiException("TENANT_SUSPENDED");
    }

    const existing = await this.userRepository.findOne({
      where: { email: invite.email, tenantId: tenant.id },
    });
    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "An account with this email already exists in this workspace." });
    }

    assertPasswordPolicy(data.password, { email: invite.email });

    const [firstName, ...rest] = data.name.trim().split(' ');
    const lastName = rest.join(' ') || undefined;

    const passwordHash = await hashPassword(data.password);

    const user = this.userRepository.create({
      tenantId: tenant.id,
      email: invite.email,
      passwordHash,
      firstName,
      lastName,
      emailVerified: true,
      isActive: true,
    });
    const savedUser = await this.userRepository.save(user);

    // Assign invited roles
    if (invite.roleIds.length > 0) {
      const userRoles = invite.roleIds.map((roleId) =>
        this.userRoleRepository.create({
          userId: savedUser.id,
          tenantId: tenant.id,
          roleId,
          invitedBy: invite.invitedBy,
          isGuest: false,
        }),
      );
      await this.userRoleRepository.save(userRoles);
    }

    // Mark invite as accepted
    await this.userInviteRepository.update(invite.id, { acceptedAt: new Date() });

    this.securityEventService.log({
      userId: savedUser.id,
      tenantId: tenant.id,
      actorEmail: savedUser.email,
      eventType: SecurityEventType.USER_REGISTERED,
      severity: "info",
      ipAddress: data.ip,
      userAgent: data.userAgent,
      metadata: { via: "invite", inviteToken: data.token.slice(0, 8) + '...' },
    });

    return { message: "Account created successfully" };
  }

}

