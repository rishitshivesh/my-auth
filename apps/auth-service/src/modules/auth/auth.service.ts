import { randomUUID } from "crypto";
import { hashToken } from "@/common/security/token-hash";
import { LinkTokenService } from "@/common/service/link-token.service";
import type { StringValue } from 'ms';
import { HttpException, Injectable, Optional } from "@nestjs/common";
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
import { RedirectUriService } from "./redirect-uri.service";
import { EmailOtpService } from "@/modules/mfa/email-otp.service";
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
import { AMR_MAGIC_LINK, AMR_PASSKEY, AMR_PASSWORD, AMR_PASSWORD_BACKUP_CODE, AMR_PASSWORD_TOTP, amrAfterSecondFactor, completableMfaMethods, preferredCompletable, parseAmr, type CompletableMfaMethod } from "./auth-methods";
import { assertTenantPasswordPolicy, passwordExpired, TenantPasswordPolicyService } from "@/modules/password-policy/tenant-password-policy.service";
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
const PASSWORD_RESET_LINK_PURPOSE = "password-reset";
const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const MAGIC_POLL_RESOURCE = "magic-poll";
const MAGIC_POLL_USED_RESOURCE = "magic-poll-used";
const MAGIC_POLL_ATTEMPTS_RESOURCE = "magic-poll-attempts";
const MAGIC_MATCH_MAX_ATTEMPTS = 5;
const MATCH_CODE_LENGTH = 6;
const INVITE_RENEW_RESOURCE = "invite-renew";
const INVITE_RENEW_COOLDOWN_SECONDS = 10 * 60;
const INVITE_RENEW_DAYS = 7;
const REAUTH_RESOURCE = "reauth-at";
const REAUTH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MFA_ENROLL_USED_RESOURCE = "mfa-enroll-used";
const MFA_ENROLL_ATTEMPTS_RESOURCE = "mfa-enroll-attempts";
const MFA_ENROLL_TTL_SECONDS = 15 * 60;
const MFA_ENROLL_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_LINK_TTL_SECONDS = 60 * 60;

interface MagicLinkMeta {
  redirectUri?: string;
  pollHash?: string;
  requestedFrom?: { userAgent: string; ip: string };
}

interface MagicPollRecord {
  state: "pending" | "complete";
  userId: string;
  codeHash: string;
}

/** "Chrome on macOS" style summary; never the raw header. */
export function coarseUserAgent(raw: string | undefined): string {
  const ua = raw ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown OS";
  return `${browser} on ${os}`;
}

export type MagicLinkOutcome =
  | { accessToken: string; refreshToken: string; tenantSlug: string; session: SessionClaims }
  | { status: 'mfa_enrollment_required'; enrollmentToken: string }
  | { status: 'confirmed-on-other-device' }
  | { mfaRequired: true; tempToken: string; message: string; availableMethods: string[]; preferredMethod: string };

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
    @Optional() private readonly passwordPolicy?: TenantPasswordPolicyService,
    @Optional() private readonly linkTokenService?: LinkTokenService,
    @Optional() private readonly emailOtpService?: EmailOtpService,
    @Optional() private readonly redirectUriService?: RedirectUriService,
  ) {}

  private async checkedRedirect(tenantId: string, raw?: string): Promise<string | undefined> {
    if (raw === undefined || raw === "") return undefined;
    if (!this.redirectUriService) throw new ApiException("NOT_IMPLEMENTED");
    return this.redirectUriService.validate(tenantId, raw);
  }

  /** One-time link store; only absent in hand-built unit-test instances. */
  private get links(): LinkTokenService {
    if (!this.linkTokenService) throw new ApiException("INTERNAL_ERROR");
    return this.linkTokenService;
  }

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
    amr: readonly string[] = AMR_PASSWORD,
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
      // Authentication methods of that login (OIDC amr); also stored on the session.
      amr: [...amr],
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

    await assertTenantPasswordPolicy(this.passwordPolicy, data.tenantId, data.password, { email: data.email });

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
      emailVerificationToken: hashToken(emailVerificationToken), // raw token only travels in the email
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
    // Suspended accounts must not obtain a session (ASVS 2.1.x / 3.3). Checked
    // after the password so only someone who knows it learns the state.
    if (user.isActive === false) {
      throw new ApiException("USER_SUSPENDED");
    }
    // Tenant password-age policy: expired passwords must be reset before a session is issued.
    if (this.passwordPolicy) {
      const policy = await this.passwordPolicy.get(tenantId);
      if (passwordExpired(policy, user.passwordChangedAt ?? user.createdAt)) {
        throw new ApiException("AUTH_PASSWORD_EXPIRED", {
          detail: "Your password has expired. Reset it to continue.",
        });
      }
    }
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
          pm: "pwd",
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
        availableMethods: completableMfaMethods(mfaStatus.methods),
        preferredMethod: preferredCompletable(mfaStatus.methods, mfaStatus.preferredMethod),
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
      amr: AMR_PASSWORD,
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
      undefined,
      AMR_PASSWORD,
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
  async forgotPassword(tenantId: string, email: string, ip: string, redirectUri?: string) {
    // Validated before the account lookup so the outcome never depends on whether the account exists.
    const redirect = await this.checkedRedirect(tenantId, redirectUri);
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

    // Link (primary) then code (fallback). The code email goes last so it stays the newest message.
    const linkToken = await this.links.issue(tenantId, PASSWORD_RESET_LINK_PURPOSE, user.id, PASSWORD_RESET_LINK_TTL_SECONDS, redirect ? { redirectUri: redirect } : undefined, true);
    await this.emailService.sendPasswordResetEmail(user, linkToken);
    await this.emailService.sendPasswordResetOtpEmail(user, otp);

    // OTP intentionally not logged for security
  }

  /**
   * Send magic link sign-in email (TENANT SCOPED)
   */
  async sendMagicLink(
    tenantId: string,
    email: string,
    opts: { redirectUri?: string; poll?: boolean; ip?: string; userAgent?: string } = {},
  ): Promise<{ pollingNonce?: string; matchCode?: string; expiresInSeconds: number }> {
    const redirect = await this.checkedRedirect(tenantId, opts.redirectUri);
    // Issued for every request (known or not) so the response never reveals whether the account exists.
    // matchCode goes ONLY to this (requesting) device, never into the email.
    const pollingNonce = opts.poll ? crypto.randomBytes(32).toString("hex") : undefined;
    const matchCode = opts.poll ? crypto.randomInt(0, 10 ** MATCH_CODE_LENGTH).toString().padStart(MATCH_CODE_LENGTH, "0") : undefined;
    const result = {
      ...(pollingNonce ? { pollingNonce, matchCode } : {}),
      expiresInSeconds: MAGIC_LINK_TTL_SECONDS,
    };

    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    const user = await this.userRepository.findOne({ where: { email, tenantId } });

    // Don't reveal if user exists
    if (!user) return result;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await this.userRepository.update(
      { id: user.id, tenantId },
      {
        magicLinkToken: tokenHash,
        magicLinkExpiresAt: new Date(Date.now() + MAGIC_LINK_TTL_SECONDS * 1000),
      },
    );

    const pollHash = pollingNonce ? hashToken(pollingNonce) : undefined;
    const meta: MagicLinkMeta = {
      ...(redirect ? { redirectUri: redirect } : {}),
      ...(pollHash ? { pollHash } : {}),
      requestedFrom: { userAgent: coarseUserAgent(opts.userAgent), ip: opts.ip ?? "unknown" },
    };
    await this.links.setMeta(tenantId, "magic-link", rawToken, meta as Record<string, unknown>, MAGIC_LINK_TTL_SECONDS);
    if (pollHash && matchCode) {
      const record: MagicPollRecord = { state: "pending", userId: user.id, codeHash: AuthService.matchCodeHash(pollHash, matchCode) };
      await this.redisService.set(tenantId, MAGIC_POLL_RESOURCE, pollHash, record, MAGIC_LINK_TTL_SECONDS);
    }

    await this.emailService.sendMagicLinkEmail(user, rawToken);

    // Magic link token intentionally not logged for security
    return result;
  }

  /**
   * Verify magic link token and create session (TENANT SCOPED)
   */
  async verifyMagicLink(
    tenantId: string,
    rawToken: string,
    ip: string,
    userAgent: string,
    matchCode?: string,
  ): Promise<MagicLinkOutcome & { redirectUri?: string }> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.magicLinkToken")
      .where("user.magicLinkToken = :tokenHash", { tokenHash })
      .andWhere("user.tenantId = :tenantId", { tenantId })
      .andWhere("user.magicLinkExpiresAt > :now", { now: new Date() })
      .getOne();

    if (!user) {
      const stale = await this.userRepository
        .createQueryBuilder("user")
        .addSelect("user.magicLinkToken")
        .where("user.magicLinkToken = :tokenHash", { tokenHash })
        .andWhere("user.tenantId = :tenantId", { tenantId })
        .getOne();
      throw await this.links.failureFor(tenantId, "magic-link", rawToken, !!stale);
    }
    const linkMeta = await this.linkTokenService?.getMeta<MagicLinkMeta>(tenantId, "magic-link", rawToken);

    if (matchCode !== undefined) {
      // Cross-device confirmation: the code shown on the REQUESTING device proves the person
      // confirming is looking at it. Checked before the link is spent so a typo does not burn it.
      await this.assertMatchCode(tenantId, linkMeta?.pollHash, matchCode);
      await this.spendMagicLink(user.id, tenantId, rawToken);
      await this.redisService.set(
        tenantId,
        MAGIC_POLL_RESOURCE,
        linkMeta!.pollHash!,
        { ...(await this.redisService.get<MagicPollRecord>(tenantId, MAGIC_POLL_RESOURCE, linkMeta!.pollHash!)), state: "complete", userId: user.id },
        MAGIC_LINK_TTL_SECONDS,
      );
      return { status: "confirmed-on-other-device", ...(linkMeta?.redirectUri ? { redirectUri: linkMeta.redirectUri } : {}) };
    }

    await this.spendMagicLink(user.id, tenantId, rawToken);
    // An ordinary click signs in the clicking device AND voids any pending cross-device request:
    // a poll can never complete from a plain click (device-code phishing).
    if (linkMeta?.pollHash) {
      await this.redisService.delete(tenantId, MAGIC_POLL_RESOURCE, linkMeta.pollHash);
    }
    const outcome = await this.finishMagicLinkLogin(user, tenantId, ip, userAgent);
    return linkMeta?.redirectUri ? { ...outcome, redirectUri: linkMeta.redirectUri } : outcome;
  }

  private async spendMagicLink(userId: string, tenantId: string, rawToken: string): Promise<void> {
    await this.linkTokenService?.noteSpent(tenantId, "magic-link", rawToken);
    // Clear the token (one-time use) and mark email as verified
    await this.userRepository.update(
      { id: userId, tenantId },
      {
        // `undefined` is skipped by TypeORM's update(); null actually clears the
        // columns so the link cannot be replayed.
        magicLinkToken: null as unknown as string,
        magicLinkExpiresAt: null as unknown as Date,
        emailVerified: true,
      },
    );
  }

  private static matchCodeHash(pollHash: string, code: string): string {
    return hashToken(`${pollHash}:${code}`);
  }

  /** Validates the number-matching code; wrong guesses are counted and void the request after 5. */
  private async assertMatchCode(tenantId: string, pollHash: string | undefined, code: string): Promise<void> {
    const invalid = () => new ApiException("AUTH_OTP_INVALID");
    if (!pollHash) throw invalid();
    const record = await this.redisService.get<MagicPollRecord>(tenantId, MAGIC_POLL_RESOURCE, pollHash);
    if (!record || record.state !== "pending") throw invalid();
    const attempts = await this.redisService.incr(tenantId, MAGIC_POLL_ATTEMPTS_RESOURCE, pollHash);
    if (attempts === 1) await this.redisService.extendTTL(tenantId, MAGIC_POLL_ATTEMPTS_RESOURCE, pollHash, MAGIC_LINK_TTL_SECONDS);
    if (attempts > MAGIC_MATCH_MAX_ATTEMPTS) {
      await this.redisService.delete(tenantId, MAGIC_POLL_RESOURCE, pollHash);
      throw invalid();
    }
    const given = Buffer.from(AuthService.matchCodeHash(pollHash, code), "hex");
    const expected = Buffer.from(record.codeHash, "hex");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw invalid();
  }

  /**
   * Non-consuming description of a magic link for the confirmation screen: where the sign-in was
   * requested from and whether a match code must be entered. Never spends the link.
   */
  async previewMagicLink(tenantId: string, rawToken: string): Promise<{ requestedFrom: { userAgent: string; ip: string } | null; requiresMatchCode: boolean }> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.magicLinkToken")
      .where("user.magicLinkToken = :tokenHash", { tokenHash })
      .andWhere("user.tenantId = :tenantId", { tenantId })
      .getOne();
    if (!user || !user.magicLinkExpiresAt || user.magicLinkExpiresAt <= new Date()) {
      throw await this.links.failureFor(tenantId, "magic-link", rawToken, !!user);
    }
    const meta = await this.links.getMeta<MagicLinkMeta>(tenantId, "magic-link", rawToken);
    const pending = meta?.pollHash
      ? (await this.redisService.get<MagicPollRecord>(tenantId, MAGIC_POLL_RESOURCE, meta.pollHash))?.state === "pending"
      : false;
    return { requestedFrom: meta?.requestedFrom ?? null, requiresMatchCode: pending };
  }

  /**
   * Cross-device completion: the device that requested the link redeems its nonce once the link
   * was verified elsewhere. The nonce never leaves that device (it is not in the email), is stored
   * hashed, lives as long as the link and is single use. Unknown, pending and expired nonces all
   * answer "pending", so nothing is revealed. MFA / enrollment policy still applies.
   */
  async pollMagicLink(tenantId: string, pollingNonce: string, ip: string, userAgent: string): Promise<MagicLinkOutcome | { status: "pending" }> {
    const pollHash = hashToken(pollingNonce);
    const record = await this.redisService.get<{ state: string; userId: string }>(tenantId, MAGIC_POLL_RESOURCE, pollHash);
    if (!record || record.state !== "complete") return { status: "pending" };
    if (!(await this.redisService.setIfAbsent(tenantId, MAGIC_POLL_USED_RESOURCE, pollHash, 1, MAGIC_LINK_TTL_SECONDS))) {
      throw new ApiException("LINK_ALREADY_USED");
    }
    const user = await this.userRepository.findOne({ where: { id: record.userId, tenantId } });
    if (!user) return { status: "pending" };
    return this.finishMagicLinkLogin(user, tenantId, ip, userAgent);
  }

  private async finishMagicLinkLogin(user: User, tenantId: string, ip: string, userAgent: string): Promise<MagicLinkOutcome> {
    // MFA enrollment enforcement: check policy AFTER credential verification but BEFORE session
    if (user.isActive === false) {
      throw new ApiException("USER_SUSPENDED");
    }
    const magicLinkMfaStatus = await this.mfaService.getMfaStatus(user.id, tenantId);
    if (magicLinkMfaStatus.enabled) {
      // A magic link is a single factor, same as a password: an enrolled second
      // factor must still be satisfied (ASVS 2.8 / 6.x MFA bypass).
      const tempToken = await this.signToken(
        {
          sub: user.id,
          email: user.email,
          tenantId,
          type: "mfa_pending",
          pm: "magic_link",
          jti: randomUUID(),
        },
        "5m",
        tenantId,
      );
      return {
        mfaRequired: true,
        tempToken,
        availableMethods: completableMfaMethods(magicLinkMfaStatus.methods),
        preferredMethod: preferredCompletable(magicLinkMfaStatus.methods, magicLinkMfaStatus.preferredMethod),
        message: "MFA verification required",
      };
    }
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
          enrollmentToken: await this.mfaPolicyService.issueEnrollmentToken(user.id, tenantId, 'magic_link'),
        };
      }
    }

    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId,
      email: user.email,
      ipAddress: ip,
      userAgent,
      amr: AMR_MAGIC_LINK,
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

    const magicLinkPayload = await this.buildAccessTokenPayload(user.id, user.email, tenantId, session.id, undefined, undefined, AMR_MAGIC_LINK);
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

    await this.assertPasswordAcceptable(user, tenantId, newPassword);
    await this.applyNewPassword(user, tenantId, newPassword, ipAddress, meta);
  }

  /**
   * Non-consuming check of a reset link (safe for scanners and GET). Throws LINK_EXPIRED,
   * LINK_ALREADY_USED or AUTH_TOKEN_INVALID; never reveals the account.
   */
  async validateResetLink(tenantId: string, token: string): Promise<{ valid: true; expiresInSeconds: number; redirectUri?: string }> {
    const found = await this.links.inspect(tenantId, PASSWORD_RESET_LINK_PURPOSE, token);
    if (found.state !== "valid" || !found.record) throw LinkTokenService.failure(found.state);
    const redirectUri = found.record.meta?.["redirectUri"];
    return {
      valid: true,
      expiresInSeconds: Math.max(0, Math.floor((found.record.expiresAt - Date.now()) / 1000)),
      ...(typeof redirectUri === "string" ? { redirectUri } : {}),
    };
  }

  /** Reset by emailed link: the token is bound to tenant + purpose + one account, single use. */
  async resetPasswordWithToken(
    tenantId: string,
    token: string,
    newPassword: string,
    ipAddress = "0.0.0.0",
    meta: { userAgent?: string; requestId?: string } = {},
  ): Promise<{ redirectUri?: string }> {
    const found = await this.links.inspect(tenantId, PASSWORD_RESET_LINK_PURPOSE, token);
    if (found.state !== "valid" || !found.record) throw LinkTokenService.failure(found.state);

    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .addSelect("user.passwordHistory")
      .where("user.tenantId = :tenantId", { tenantId })
      .andWhere("user.id = :id", { id: found.record.subjectId })
      .getOne();
    if (!user) throw LinkTokenService.failure("invalid");

    // Policy first: a rejected password must leave the link usable.
    await this.assertPasswordAcceptable(user, tenantId, newPassword);
    await this.links.consume(tenantId, PASSWORD_RESET_LINK_PURPOSE, token);
    await this.applyNewPassword(user, tenantId, newPassword, ipAddress, meta);
    const redirectUri = found.record.meta?.["redirectUri"];
    return typeof redirectUri === "string" ? { redirectUri } : {};
  }

  private async assertPasswordAcceptable(user: User, tenantId: string, newPassword: string): Promise<void> {
    await assertTenantPasswordPolicy(this.passwordPolicy, tenantId, newPassword, { email: user.email });
    const policy = await this.passwordPolicy?.get(tenantId);
    const historyCount = policy?.historyCount ?? 5;
    for (const oldHash of (user.passwordHistory || []).slice(0, historyCount)) {
      if (await verifyPassword(oldHash, newPassword)) {
        throw new ApiException("PASSWORD_POLICY", {
          errors: [{ field: "password", message: "Password has been used recently. Please choose a different password." }],
        });
      }
    }
  }

  private async applyNewPassword(
    user: User,
    tenantId: string,
    newPassword: string,
    ipAddress: string,
    meta: { userAgent?: string; requestId?: string },
  ): Promise<void> {
    const policy = await this.passwordPolicy?.get(tenantId);
    const historyCount = policy?.historyCount ?? 5;
    const passwordHistory = user.passwordHistory || [];
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and history
    const updatedHistory = [
      ...(user.passwordHash ? [user.passwordHash] : []),
      ...passwordHistory,
    ].slice(0, historyCount);

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        passwordHash: newPasswordHash,
        passwordHistory: updatedHistory,
        passwordChangedAt: new Date(),
        // `undefined` is skipped by TypeORM's update(); null actually clears
        // the columns so the code cannot be replayed.
        passwordResetToken: null as unknown as string,
        passwordResetExpiresAt: null as unknown as Date,
      },
    );
    await this.redisService.delete(tenantId, PASSWORD_RESET_ATTEMPTS_RESOURCE, user.id);
    // Any outstanding reset link for this account is spent too, whichever path was used.
    await this.linkTokenService?.supersede(tenantId, PASSWORD_RESET_LINK_PURPOSE, user.id);

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
  async verifyEmail(tenantId: string, token: string): Promise<{ redirectUri?: string }> {
    const user = await this.userRepository.findOne({
      where: {
        tenantId, // ← Tenant filter
        emailVerificationToken: hashToken(token),
        emailVerificationExpiresAt: MoreThan(new Date()),
      },
    });

    if (!user) {
      const stale = await this.userRepository.findOne({
        where: { tenantId, emailVerificationToken: hashToken(token) },
      });
      throw await this.links.failureFor(tenantId, "verify-email", token, !!stale);
    }
    await this.linkTokenService?.noteSpent(tenantId, "verify-email", token);

    await this.userRepository.update(
      { id: user.id, tenantId }, // ← Tenant-scoped update
      {
        emailVerified: true,
        // null (not undefined) so the token is really cleared and single-use.
        emailVerificationToken: null as unknown as string,
        emailVerificationExpiresAt: null as unknown as Date,
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
    const meta = await this.linkTokenService?.getMeta<{ redirectUri?: string }>(tenantId, "verify-email", token);
    return meta?.redirectUri ? { redirectUri: meta.redirectUri } : {};
  }

  /**
   * Resend verification email (TENANT SCOPED)
   */
  async resendVerification(tenantId: string, email: string, redirectUri?: string) {
    const redirect = await this.checkedRedirect(tenantId, redirectUri);
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
        emailVerificationToken: hashToken(emailVerificationToken),
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    );

    if (redirect) await this.links.setMeta(tenantId, "verify-email", emailVerificationToken, { redirectUri: redirect }, 24 * 60 * 60);
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
      select: { id: true, createdAt: true, amr: true },
    });

    const loginAt = loginSession ? Math.floor(loginSession.createdAt.getTime() / 1000) : 0;
    const stepUp = await this.redisService.get<{ at: number; amr: string[] }>(tenantId, REAUTH_RESOURCE, accessTokenPayload.sessionId as string);
    // Enrich payload with groups and tenantSlug
    const enrichedPayload = await this.buildAccessTokenPayload(
      accessTokenPayload.sub as string,
      accessTokenPayload.email as string,
      accessTokenPayload.tenantId as string,
      accessTokenPayload.sessionId as string,
      undefined,
      Math.max(loginAt, stepUp?.at ?? 0),
      // Refreshing keeps the methods of whichever authentication is the latest: the sign-in, or a
      // step-up (then ONLY what that step-up proved). Legacy sessions without any count as password.
      stepUp && stepUp.at >= loginAt
        ? stepUp.amr
        : parseAmr(loginSession?.amr).length > 0 ? parseAmr(loginSession?.amr) : AMR_PASSWORD,
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

  /** Creates the session + tokens once every required factor has been proven. */
  private async issueMfaSession(args: {
    tenantId: string;
    userId: string;
    email: string;
    amr: readonly string[];
    ip: string;
    userAgent: string;
  }) {
    const { tenantId, userId, email, amr, ip } = args;
    const userAgent = args.userAgent || "unknown";
    const session = await this.sessionService.createSession({ userId, tenantId, email, ipAddress: ip, userAgent, amr });
    // Same refresh-token path as password login so /refresh can rotate it.
    const { token: refreshToken } = await this.oauthRefreshTokenService.createRefreshToken({
      tenantId,
      userId,
      sessionId: session.id,
      clientId: undefined,
      ipAddress: ip,
      userAgent,
      expiresInDays: 30,
    });
    const payload = await this.buildAccessTokenPayload(userId, email, tenantId, session.id, undefined, undefined, amr);
    const accessToken = await this.signToken(payload, "15m", tenantId);
    return {
      accessToken,
      refreshToken,
      tenantSlug: (payload.tenantSlug as string) ?? "",
      session: this.toSessionClaims(payload),
    };
  }

  /**
   * Verify the second factor and complete login. `opts.method` defaults to TOTP; `email` needs a
   * code emailed through requestMfaEmailOtp; `webauthn` needs the assertion from
   * startMfaWebAuthn. A method is accepted only if the user actually has it enrolled.
   */
  async verifyMfa(
    tenantId: string,
    tempToken: string,
    code: string,
    ip: string,
    userAgent: string,
    opts: { method?: CompletableMfaMethod; webauthn?: { response: AuthenticationResponseJSON; sessionNonce: string } } = {},
  ) {
    const payload = await this.verifyMfaTempToken(tempToken);
    const userId = payload.sub as string;
    const method = opts.method ?? "totp";
    const challengeId = typeof payload.jti === "string" ? payload.jti : undefined;

    logger.info({ userId, method }, "Verifying MFA for user");

    if (method !== "totp") await this.assertMfaMethodEnrolled(userId, tenantId, method);

    let verified: boolean;
    if (method === "totp") {
      verified = await this.mfaService.verifyTotp(userId, tenantId, code, challengeId);
    } else if (method === "email") {
      verified = await this.requireEmailOtp().verifyOtp(userId, tenantId, code);
    } else {
      if (!opts.webauthn) throw new ApiException("VALIDATION_FAILED", { errors: [{ field: "webauthnResponse", message: "required for method webauthn" }] });
      verified = await this.webauthnService.finishAuthentication(userId, tenantId, opts.webauthn.response, opts.webauthn.sessionNonce);
    }
    if (!verified) throw new ApiException("AUTH_MFA_INVALID");

    const issued = await this.issueMfaSession({
      tenantId,
      userId,
      email: payload.email as string,
      amr: amrAfterSecondFactor(typeof payload.pm === "string" ? payload.pm : undefined, method),
      ip,
      userAgent,
    });
    logger.info({ userId }, "MFA verified successfully");
    return { ...issued, message: "MFA verified successfully" };
  }

  private requireEmailOtp(): EmailOtpService {
    if (!this.emailOtpService) throw new ApiException("NOT_IMPLEMENTED");
    return this.emailOtpService;
  }

  private async assertMfaMethodEnrolled(userId: string, tenantId: string, method: CompletableMfaMethod): Promise<void> {
    const status = await this.mfaService.getMfaStatus(userId, tenantId);
    if (!status.methods.includes(method)) throw new ApiException("AUTH_MFA_INVALID");
  }

  /** Emails a login-time code. Authenticated by the mfa_pending token; only for enrolled email MFA. */
  async requestMfaEmailOtp(tenantId: string, tempToken: string): Promise<void> {
    const payload = await this.verifyMfaTempToken(tempToken);
    const userId = payload.sub as string;
    await this.assertMfaMethodEnrolled(userId, tenantId, "email");
    await this.requireEmailOtp().sendOtp(userId, tenantId);
  }

  /** WebAuthn assertion options for the second factor, authenticated by the mfa_pending token. */
  async startMfaWebAuthn(tenantId: string, tempToken: string) {
    const payload = await this.verifyMfaTempToken(tempToken);
    const userId = payload.sub as string;
    await this.assertMfaMethodEnrolled(userId, tenantId, "webauthn");
    const { options, sessionNonce } = await this.webauthnService.startAuthentication(userId, tenantId);
    return { ...options, sessionNonce };
  }

  // ------------------------------------------------------------------- step-up

  /** Passkey assertion options for a step-up on the caller's own account. */
  async startReauthWebAuthn(tenantId: string, userId: string) {
    const { options, sessionNonce } = await this.webauthnService.startAuthentication(userId, tenantId);
    return { ...options, sessionNonce };
  }

  /**
   * Step-up: proves the signed-in user again (password, TOTP or passkey) and refreshes the
   * session's `authTime` so @RequireRecentAuth passes. Same session, no new session is created.
   * Returns a fresh access token carrying the new authTime/amr.
   */
  async reauthenticate(
    tenantId: string,
    userId: string,
    sessionId: string,
    input: {
      method: "password" | "totp" | "webauthn";
      password?: string;
      code?: string;
      webauthn?: { response: AuthenticationResponseJSON; sessionNonce: string };
    },
    ctx: { ip: string; userAgent: string } = { ip: "0.0.0.0", userAgent: "unknown" },
  ) {
    if (!sessionId) throw new ApiException("AUTH_SESSION_REVOKED");
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :userId", { userId })
      .andWhere("user.tenantId = :tenantId", { tenantId })
      .getOne();
    if (!user || user.isActive === false) throw new ApiException("AUTH_TOKEN_INVALID");

    // Step-up must prove at least as much as sign-in does for this account: a user with any enrolled
    // second factor cannot refresh authTime with the password alone.
    const mfaStatus = await this.mfaService.getMfaStatus(userId, tenantId);
    const hasSecondFactorInput = !!input.code || !!input.webauthn;
    if (mfaStatus.enabled && input.method === "password" && !hasSecondFactorInput) {
      throw new ApiException("AUTH_MFA_REQUIRED", {
        detail: "Two-step verification is on for this account. Confirm with your authenticator app or passkey (method totp / webauthn, or password together with code / webauthnResponse).",
      });
    }

    // Same attempt protections as sign-in: throttle password guesses, per-session challenge for codes.
    const challengeId = `reauth:${sessionId}`;
    const proven: string[] = [];
    if (input.method === "password") {
      if ((await this.loginThrottle.charge(tenantId, user.email, ctx.ip)).blocked) {
        throw new ApiException("RATE_LIMITED", { retryAfterSeconds: 60 });
      }
      const ok = user.passwordHash && input.password
        ? await verifyPassword(user.passwordHash, input.password)
        : (await verifyAgainstDummy(input.password ?? ""), false);
      if (!ok) throw new ApiException("AUTH_INVALID_CREDENTIALS");
      await this.loginThrottle.refund(tenantId, user.email);
      proven.push(...AMR_PASSWORD);
    }
    if (input.method === "totp" || (input.method === "password" && input.code)) {
      if (!input.code || !(await this.mfaService.verifyTotp(userId, tenantId, input.code, challengeId))) {
        throw new ApiException("AUTH_MFA_INVALID");
      }
      proven.push("otp", "totp");
    } else if (input.method === "webauthn" || (input.method === "password" && input.webauthn)) {
      if (!input.webauthn || !(await this.webauthnService.finishAuthentication(userId, tenantId, input.webauthn.response, input.webauthn.sessionNonce))) {
        throw new ApiException("PASSKEY_INVALID");
      }
      proven.push("hwk", "webauthn");
    }
    // Two distinct factors proven in this request => "mfa". A single factor is just that factor.
    const factorAmr = proven.length > 2 ? [...proven, "mfa"] : proven;

    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, tenantId, userId },
      select: { id: true, amr: true, revokedAt: true },
    });
    if (!session || session.revokedAt) throw new ApiException("AUTH_SESSION_REVOKED");

    const now = Math.floor(Date.now() / 1000);
    // Only what THIS step-up proved: never merged with the original sign-in's amr, so the token cannot
    // claim a stronger or fresher assurance than was actually demonstrated.
    const amr = [...new Set(factorAmr)];
    await this.redisService.set(tenantId, REAUTH_RESOURCE, sessionId, { at: now, amr }, REAUTH_TTL_SECONDS);
    const payload = await this.buildAccessTokenPayload(userId, user.email, tenantId, sessionId, undefined, now, amr);
    const accessToken = await this.signToken(payload, "15m", tenantId);

    this.securityEventService.log({
      userId,
      tenantId,
      actorEmail: user.email,
      eventType: SecurityEventType.LOGIN_SUCCESS,
      severity: "info",
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reauth: true, method: input.method },
    });
    return { accessToken, session: this.toSessionClaims(payload) };
  }

  // ------------------------------------------------------------ pre-session enrollment

  private async resolveEnrollment(tenantId: string, token: string) {
    const claims = await this.mfaPolicyService.verifyEnrollmentToken(token);
    // Bound to the tenant it was issued for; a token never works across tenants.
    if (claims.tenantId !== tenantId) throw new ApiException("AUTH_TOKEN_INVALID");
    if (await this.redisService.get(tenantId, MFA_ENROLL_USED_RESOURCE, claims.jti)) {
      throw new ApiException("LINK_ALREADY_USED");
    }
    const user = await this.userRepository.findOne({ where: { id: claims.userId, tenantId } });
    if (!user || user.isActive === false) throw new ApiException("AUTH_TOKEN_INVALID");
    if (await this.mfaService.isMfaEnabled(user.id, tenantId)) {
      // Enrolled users must pass the normal second-factor challenge instead.
      throw new ApiException("MFA_ALREADY_ENABLED");
    }
    return { claims, user };
  }

  /** Starts TOTP enrollment for a user holding an enrollment token. Backup codes come with confirm. */
  async enrollTotpSetup(tenantId: string, token: string): Promise<{ secret: string; qrCode: string }> {
    const { user } = await this.resolveEnrollment(tenantId, token);
    const { secret, qrCode } = await this.mfaService.setupTotp(user.id, tenantId);
    return { secret, qrCode };
  }

  /** Confirms the first TOTP code, enables TOTP, spends the token and issues the session. */
  async enrollTotpConfirm(tenantId: string, token: string, code: string, ip: string, userAgent: string) {
    const { claims, user } = await this.resolveEnrollment(tenantId, token);
    const attempts = await this.redisService.incr(tenantId, MFA_ENROLL_ATTEMPTS_RESOURCE, claims.jti);
    if (attempts === 1) await this.redisService.extendTTL(tenantId, MFA_ENROLL_ATTEMPTS_RESOURCE, claims.jti, MFA_ENROLL_TTL_SECONDS);
    if (attempts > MFA_ENROLL_MAX_ATTEMPTS) {
      await this.redisService.setIfAbsent(tenantId, MFA_ENROLL_USED_RESOURCE, claims.jti, 1, MFA_ENROLL_TTL_SECONDS);
      throw new ApiException("AUTH_TOKEN_INVALID");
    }
    const { backupCodes } = await this.mfaService.verifyAndEnableTotp(user.id, tenantId, code, {
      ipAddress: ip,
      userAgent: userAgent || "unknown",
    });
    if (!(await this.redisService.setIfAbsent(tenantId, MFA_ENROLL_USED_RESOURCE, claims.jti, 1, MFA_ENROLL_TTL_SECONDS))) {
      throw new ApiException("LINK_ALREADY_USED");
    }
    const issued = await this.issueMfaSession({
      tenantId,
      userId: user.id,
      email: user.email,
      amr: amrAfterSecondFactor(claims.firstFactor, "totp"),
      ip,
      userAgent,
    });
    return { ...issued, backupCodes };
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
    const session = await this.sessionService.createSession({
      userId: payload.sub as string,
      tenantId,
      email: payload.email as string,
      ipAddress: ip,
      userAgent: userAgent || "unknown",
      amr: AMR_PASSWORD_BACKUP_CODE,
    });

    // Same refresh-token path as password login so /refresh can rotate it.
    const { token: refreshToken } = await this.oauthRefreshTokenService.createRefreshToken({
      tenantId,
      userId: payload.sub as string,
      sessionId: session.id,
      clientId: undefined,
      ipAddress: ip,
      userAgent: userAgent || "unknown",
      expiresInDays: 30,
    });

    const backupPayload = await this.buildAccessTokenPayload(payload.sub as string, payload.email as string, tenantId, session.id, undefined, undefined, AMR_PASSWORD_BACKUP_CODE);
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
          enrollmentToken: await this.mfaPolicyService.issueEnrollmentToken(user.id, tenantId, 'passkey'),
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
      amr: AMR_PASSKEY,
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

    const passkeyPayload = await this.buildAccessTokenPayload(user.id, user.email, tenantId, session.id, undefined, undefined, AMR_PASSKEY);
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
      where: { token: hashToken(token) },
      relations: ['tenant'],
    });

    if (!invite) {
      throw new ApiException("INVITE_INVALID");
    }
    if (invite.acceptedAt) {
      throw new ApiException("LINK_ALREADY_USED", { detail: "This invitation has already been used." });
    }
    if (invite.expiresAt < new Date()) {
      throw new ApiException("LINK_EXPIRED", { detail: "This invitation has expired." });
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
  }): Promise<{ message: string; canSignInNow: boolean }> {
    const invite = await this.userInviteRepository.findOne({
      where: { token: hashToken(data.token) },
      relations: ['tenant'],
    });

    if (!invite) {
      throw new ApiException("INVITE_INVALID");
    }
    if (invite.acceptedAt) {
      throw new ApiException("LINK_ALREADY_USED", { detail: "This invitation has already been used." });
    }
    if (invite.expiresAt < new Date()) {
      throw new ApiException("LINK_EXPIRED", { detail: "This invitation has expired." });
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

    await assertTenantPasswordPolicy(this.passwordPolicy, tenant.id, data.password, { email: invite.email });

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
      metadata: { via: "invite" },
    });

    // Email is verified by the invite and the password was just set: the invitee can sign in right away
    // (MFA / enrollment policy still applies at that sign-in).
    return { message: "Account created successfully", canSignInNow: true };
  }


  /**
   * Invitee-side "send me a new link". The caller holds the (possibly expired) invite token, so
   * the answers can be specific without revealing anything else. A fresh token replaces the old
   * one, goes only to the invited address, and is rate limited per invitation.
   */
  async requestNewInvite(tenantId: string, token: string): Promise<{ message: string; expiresInDays: number }> {
    const invite = await this.userInviteRepository.findOne({
      where: { token: hashToken(token) },
      relations: ['tenant'],
    });
    if (!invite || invite.tenantId !== tenantId) throw new ApiException("INVITE_INVALID");
    if (invite.acceptedAt) throw new ApiException("LINK_ALREADY_USED", { detail: "This invitation has already been used." });
    if (!invite.tenant || !invite.tenant.active) throw new ApiException("TENANT_SUSPENDED");

    const claimed = await this.redisService.setIfAbsent(tenantId, INVITE_RENEW_RESOURCE, invite.id, 1, INVITE_RENEW_COOLDOWN_SECONDS);
    if (!claimed) {
      throw new ApiException("RATE_LIMITED", { retryAfterSeconds: INVITE_RENEW_COOLDOWN_SECONDS, detail: "A new invitation was sent recently. Check your inbox." });
    }

    const freshToken = crypto.randomBytes(64).toString("hex");
    await this.userInviteRepository.update(invite.id, {
      token: hashToken(freshToken),
      expiresAt: new Date(Date.now() + INVITE_RENEW_DAYS * 24 * 60 * 60 * 1000),
    });
    const frontendUrl = this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    await this.emailService.sendInviteEmail({
      to: invite.email,
      inviterName: "A workspace admin",
      tenantName: invite.tenant.name,
      tenantId,
      inviteUrl: `${frontendUrl}/invite/${freshToken}`,
      expiresInDays: INVITE_RENEW_DAYS,
    });
    return { message: "A new invitation was sent to the invited email address.", expiresInDays: INVITE_RENEW_DAYS };
  }
}
