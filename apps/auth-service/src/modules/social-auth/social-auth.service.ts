import {
  Injectable,
  Logger,
} from "@nestjs/common";
import { AMR_SOCIAL } from "@/modules/auth/auth-methods";
import { ApiException } from "@/common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  User,
  UserRole,
  UserSocialConnection,
  TenantSocialProvider,
  SocialLinkRequest,
  Session,
  SecurityEventType,
} from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import { TokenEncryptionService } from "../auth/oauth-token-encryption.service";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { SessionService } from "@/common/service/session.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { MfaPolicyService } from '@/modules/mfa/mfa-policy.service';
import { MfaService } from '@/modules/mfa/mfa.service';
import { EmailService } from '@/modules/email/email.service';
export interface SocialProfile {
  provider: "google" | "github" | "microsoft" | "apple" | "linkedin";
  providerId: string;
  email: string;
  emailVerified?: boolean;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes?: string;
  raw?: any; // Raw provider response
}

/**
 * SocialAuthService
 *
 * Main service for social authentication
 *
 * Features:
 * - Login with Google/GitHub/Microsoft/etc.
 * - Auto-create users on first login
 * - Account linking (explicit with verification)
 * - Token storage (encrypted)
 * - Multi-tenant support
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSocialConnection)
    private readonly socialConnectionRepository: Repository<UserSocialConnection>,
    @InjectRepository(TenantSocialProvider)
    private readonly tenantProviderRepository: Repository<TenantSocialProvider>,
    @InjectRepository(SocialLinkRequest)
    private readonly linkRequestRepository: Repository<SocialLinkRequest>,
    private readonly securityEventService: SecurityEventService,
    private readonly tokenEncryptionService: TokenEncryptionService,
    private readonly sessionService: SessionService,
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly jwksService: JwksService,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    private readonly mfaPolicyService: MfaPolicyService,
    private readonly mfaService: MfaService,
    private readonly emailService: EmailService,
  ) {}

  private async signToken(payload: Record<string, unknown>, expiresIn: string, tenantId?: string): Promise<string> {
    const { kid, privateKey } = await this.jwksService.getCurrentSigningKey(tenantId);
    return this.jwtService.sign(payload, {
      privateKey: privateKey as any,
      algorithm: 'RS256',
      header: { alg: 'RS256', kid },
      expiresIn: expiresIn as any,
    });
  }

  /**
   * Handle social login callback
   *
   * This is called after user approves OAuth at provider
   *
   * Flow:
   * 1. Check if social connection exists
   * 2. If YES: Login user
   * 3. If NO: Check if email exists
   *    a. If email exists: Initiate account linking
   *    b. If email doesn't exist: Create new user
   */
  async handleCallback(params: {
    tenantId: string;
    profile: SocialProfile;
    ipAddress: string;
    userAgent: string;
  }): Promise<
    | { type: "success"; accessToken: string; refreshToken: string; user: { id: string; email: string; firstName?: string; lastName?: string; displayName?: string; avatarUrl?: string; emailVerified: boolean } }
    | { type: "link_required"; email: string; provider: string; message: string }
    | { type: 'mfa_enrollment_required'; enrollmentToken: string }
  > {
    const { tenantId, profile, ipAddress, userAgent } = params;

    this.logger.log("Handling social login callback", {
      tenantId,
      provider: profile.provider,
      email: profile.email,
    });

    // Step 1: Check if social connection exists
    const existingConnection = await this.socialConnectionRepository.findOne({
      where: {
        tenantId,
        provider: profile.provider,
        providerId: profile.providerId,
      },
      relations: ["user"],
    });

    if (existingConnection) {
      // User exists, login
      return this.loginWithSocialConnection(
        existingConnection,
        profile,
        ipAddress,
        userAgent,
      );
    }

    // Step 2: Check if user with this email exists
    const existingUser = await this.userRepository.findOne({
      where: {
        tenantId,
        email: profile.email,
      },
    });

    if (existingUser) {
      // Never link on the strength of an email the provider has not verified:
      // anyone can add an unverified address to a provider account.
      if (profile.emailVerified === false) {
        throw new ApiException("SOCIAL_PROVIDER_ERROR", {
          detail: "The sign-in provider has not verified this email address.",
        });
      }

      // Email exists, require account linking (never auto-link; the mailbox
      // owner must confirm). See confirmLinking for unverified local accounts.
      this.logger.log("User exists with email, requiring account linking", {
        userId: existingUser.id,
        email: profile.email,
        provider: profile.provider,
      });

      // Create link request (user needs to confirm via email)
      await this.createLinkRequest(existingUser, profile, ipAddress, userAgent);

      return {
        type: "link_required",
        email: profile.email,
        provider: profile.provider,
        message:
          "An account with this email already exists. Please check your email to link accounts.",
      };
    }

    // Step 3: No existing user, create new account
    return this.createUserWithSocialConnection(
      tenantId,
      profile,
      ipAddress,
      userAgent,
    );
  }

  /**
   * Login user with existing social connection
   */
  private async loginWithSocialConnection(
    connection: UserSocialConnection,
    profile: SocialProfile,
    ipAddress: string,
    userAgent: string,
  ): Promise<
    | { type: 'success'; accessToken: string; refreshToken: string; user: { id: string; email: string; firstName?: string; lastName?: string; displayName?: string; avatarUrl?: string; emailVerified: boolean } }
    | { type: 'mfa_enrollment_required'; enrollmentToken: string }
  > {
    const user = connection.user;

    // A suspended / deactivated account must not obtain a session, and its
    // provider tokens must not be refreshed.
    if (user.isActive === false || (user.status !== undefined && user.status !== "active")) {
      this.logger.warn("Social login refused for inactive user", { userId: user.id });
      throw new ApiException("USER_SUSPENDED");
    }

    this.logger.log("Logging in user with social connection", {
      userId: user.id,
      provider: profile.provider,
    });

    // Update connection tokens
    const encryptedTokens = this.tokenEncryptionService.encryptTokens({
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
    });

    await this.socialConnectionRepository.update(connection.id, {
      accessToken: encryptedTokens.accessToken,
      refreshToken: encryptedTokens.refreshToken,
      tokenExpiresAt: profile.expiresIn
        ? new Date(Date.now() + profile.expiresIn * 1000)
        : undefined,
      lastUsedAt: new Date(),
      // Update profile data
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    // MFA enforcement: check before issuing session
    const enrollment = await this.enforceMfaEnrollment(user.id, connection.tenantId);
    if (enrollment) return enrollment;

    // Create session
    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId: connection.tenantId,
      email: user.email,
      ipAddress,
      userAgent,
      amr: AMR_SOCIAL,
    });

    // Create refresh token
    const { token: refreshToken } =
      await this.oauthRefreshTokenService.createRefreshToken({
        tenantId: connection.tenantId,
        userId: user.id,
        sessionId: session.id,
        ipAddress,
        userAgent,
      });

    // Generate access token
    const accessToken = await this.signToken(
      {
        sub: user.id,
        email: user.email,
        tenantId: connection.tenantId,
        sessionId: session.id,
        authTime: Math.floor(Date.now() / 1000),
        amr: [...AMR_SOCIAL],
      },
      "15m",
      connection.tenantId,
    );

    // Update user last login
    await this.userRepository.update(user.id, {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
    });

    // Log security event
    this.securityEventService.log({
      tenantId: connection.tenantId,
      userId: user.id,
      actorEmail: user.email,
      eventType: SecurityEventType.SOCIAL_LOGIN_SUCCESS,
      severity: "info",
      ipAddress,
      userAgent,
      resourceId: session.id,
      resourceType: "session",
      metadata: {
        provider: profile.provider,
        sessionId: session.id,
      },
    });

    this.logger.log("Social login successful", {
      userId: user.id,
      provider: profile.provider,
    });

    return {
      type: "success",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || profile.avatarUrl,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Tenant MFA policy: returns an enrollment challenge when the user has no
   * MFA yet but the tenant (or the user's admin role) requires it.
   */
  private async enforceMfaEnrollment(
    userId: string,
    tenantId: string,
  ): Promise<{ type: "mfa_enrollment_required"; enrollmentToken: string } | null> {
    const mfaStatus = await this.mfaService.getMfaStatus(userId, tenantId);
    if (mfaStatus.enabled) return null;

    const mfaPolicy = await this.mfaPolicyService.getForTenant(tenantId);
    const needsEnrollment =
      mfaPolicy.enforceForAllUsers ||
      (mfaPolicy.enforceForAdmins &&
        (await this.userRoleRepository.find({ where: { userId, tenantId }, relations: ["role"] }))
          .some((ur) => ["owner", "admin"].includes(ur.role?.name?.toLowerCase() ?? "")));

    if (!needsEnrollment) return null;
    return {
      type: "mfa_enrollment_required",
      enrollmentToken: await this.mfaPolicyService.issueEnrollmentToken(userId, tenantId, 'social'),
    };
  }

  /**
   * Create new user with social connection
   */
  private async createUserWithSocialConnection(
    tenantId: string,
    profile: SocialProfile,
    ipAddress: string,
    userAgent: string,
  ): Promise<
    | {
        type: "success";
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; firstName?: string; lastName?: string; displayName?: string; avatarUrl?: string; emailVerified: boolean };
      }
    | { type: "mfa_enrollment_required"; enrollmentToken: string }
  > {
    this.logger.log("Creating new user with social connection", {
      tenantId,
      provider: profile.provider,
      email: profile.email,
    });

    // An address the provider has not verified proves nothing about the mailbox owner.
    if (profile.emailVerified === false) {
      throw new ApiException("SOCIAL_PROVIDER_ERROR", {
        detail: "The sign-in provider has not verified this email address.",
      });
    }

    // Create user
    const user = await this.userRepository.save({
      tenantId,
      email: profile.email,
      emailVerified: true, // Trust provider verification
      firstName: profile.firstName || profile.displayName?.split(" ")[0],
      lastName:
        profile.lastName || profile.displayName?.split(" ").slice(1).join(" "),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      primaryAuthMethod: profile.provider,
      passwordHash: undefined, // No password for social users
      status: "active",
    });

    // Encrypt tokens
    const encryptedTokens = this.tokenEncryptionService.encryptTokens({
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
    });

    // Create social connection
    await this.socialConnectionRepository.save({
      tenantId,
      userId: user.id,
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      accessToken: encryptedTokens.accessToken,
      refreshToken: encryptedTokens.refreshToken,
      tokenExpiresAt: profile.expiresIn
        ? new Date(Date.now() + profile.expiresIn * 1000)
        : undefined,
      scopes: profile.scopes,
      metadata: profile.raw,
      primary: true,
      lastUsedAt: new Date(),
    });

    // Fresh social users are subject to the same tenant MFA policy.
    const enrollment = await this.enforceMfaEnrollment(user.id, tenantId);
    if (enrollment) return enrollment;

    // Create session
    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId,
      email: user.email,
      ipAddress,
      userAgent,
      amr: AMR_SOCIAL,
    });

    // Create refresh token
    const { token: refreshToken } =
      await this.oauthRefreshTokenService.createRefreshToken({
        tenantId,
        userId: user.id,
        sessionId: session.id,
        ipAddress,
        userAgent,
      });

    // Generate access token
    const accessToken = await this.signToken(
      {
        sub: user.id,
        email: user.email,
        tenantId,
        sessionId: session.id,
        authTime: Math.floor(Date.now() / 1000),
        amr: [...AMR_SOCIAL],
      },
      "15m",
      tenantId,
    );

    // Log security event
    this.securityEventService.log({
      tenantId,
      userId: user.id,
      actorEmail: user.email,
      eventType: SecurityEventType.SOCIAL_USER_CREATED,
      severity: "info",
      ipAddress,
      userAgent,
      resourceId: session.id,
      resourceType: "session",
      metadata: {
        provider: profile.provider,
        sessionId: session.id,
      },
    });

    this.logger.log("New user created with social connection", {
      userId: user.id,
      provider: profile.provider,
    });

    return {
      type: "success",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Create account linking request
   *
   * Sends email to user to confirm linking
   */
  private async createLinkRequest(
    user: User,
    profile: SocialProfile,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    // Generate verification token
    const token = crypto.randomBytes(32).toString("hex");

    // Encrypt tokens for storage
    const encryptedTokens = this.tokenEncryptionService.encryptTokens({
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
    });

    // Create link request
    await this.linkRequestRepository.save({
      tenantId: user.tenantId,
      userId: user.id,
      provider: profile.provider,
      providerId: profile.providerId,
      providerEmail: profile.email,
      token,
      profileData: {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accessToken: encryptedTokens.accessToken!,
        refreshToken: encryptedTokens.refreshToken,
        tokenExpiresAt: profile.expiresIn
          ? new Date(Date.now() + profile.expiresIn * 1000)
          : undefined,
        scopes: profile.scopes,
        metadata: profile.raw,
      },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      ipAddress,
      userAgent,
    });

    await this.emailService.sendAccountLinkRequest({
      user,
      provider: profile.provider,
      token,
    });

    this.logger.log("Account link request created", {
      userId: user.id,
      provider: profile.provider,
    });
  }

  /**
   * Confirm account linking
   *
   * User clicks link in email to confirm
   */
  async confirmLinking(token: string): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.log("Confirming account linking");

    // Find link request
    const linkRequest = await this.linkRequestRepository.findOne({
      where: { token, completed: false },
      relations: ["user"],
    });

    if (!linkRequest) {
      throw new ApiException("AUTH_TOKEN_INVALID");
    }

    if (linkRequest.isExpired) {
      throw new ApiException("AUTH_TOKEN_EXPIRED");
    }

    // Pre-registration takeover guard: a local account whose email was never
    // verified may have been created by someone other than the mailbox owner,
    // who then knows its password. The owner has now proven control of the
    // mailbox through the link email, so keep the account but drop that password.
    const reclaimedUnverified = linkRequest.user?.emailVerified === false;
    if (reclaimedUnverified) {
      await this.userRepository.update(linkRequest.userId, {
        emailVerified: true,
        passwordHash: () => "NULL",
      });
    }

    // Create social connection
    await this.socialConnectionRepository.save({
      tenantId: linkRequest.tenantId,
      userId: linkRequest.userId,
      provider: linkRequest.provider,
      providerId: linkRequest.providerId,
      email: linkRequest.providerEmail,
      displayName: linkRequest.profileData.displayName,
      avatarUrl: linkRequest.profileData.avatarUrl,
      accessToken: linkRequest.profileData.accessToken,
      refreshToken: linkRequest.profileData.refreshToken,
      tokenExpiresAt: linkRequest.profileData.tokenExpiresAt,
      scopes: linkRequest.profileData.scopes,
      metadata: linkRequest.profileData.metadata,
      primary: false,
      lastUsedAt: new Date(),
    });

    // Mark request as completed
    await this.linkRequestRepository.update(linkRequest.id, {
      completed: true,
      completedAt: new Date(),
    });

    // Log security event
    this.securityEventService.log({
      tenantId: linkRequest.tenantId,
      userId: linkRequest.userId,
      eventType: SecurityEventType.SOCIAL_ACCOUNT_LINKED,
      severity: "info",
      ipAddress: linkRequest.ipAddress ?? "",
      userAgent: linkRequest.userAgent ?? "",
      metadata: {
        provider: linkRequest.provider,
        reclaimedUnverified,
      },
    });

    this.logger.log("Account linking confirmed", {
      userId: linkRequest.userId,
      provider: linkRequest.provider,
    });

    return {
      success: true,
      message: `${linkRequest.provider} account linked successfully`,
    };
  }

  /**
   * Unlink social account
   */
  async unlinkAccount(
    userId: string,
    tenantId: string,
    provider: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log("Unlinking social account", {
      userId,
      tenantId,
      provider,
    });

    // Find connection
    const connection = await this.socialConnectionRepository.findOne({
      where: {
        userId,
        tenantId,
        provider: provider as any,
      },
    });

    if (!connection) {
      throw new ApiException("RESOURCE_NOT_FOUND", { detail: "Social connection not found" });
    }

    // Check if user has password or other auth method
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      select: ["passwordHash"],
    });

    const otherConnections = await this.socialConnectionRepository.count({
      where: {
        userId,
        tenantId,
      },
    });

    if (!user?.passwordHash && otherConnections <= 1) {
      throw new ApiException("RESOURCE_CONFLICT", {
        detail: "Cannot unlink your last sign-in method. Set a password first.",
      });
    }

    // Delete connection
    await this.socialConnectionRepository.delete(connection.id);

    // Log security event
    this.securityEventService.log({
      tenantId,
      userId,
      eventType: SecurityEventType.SOCIAL_ACCOUNT_UNLINKED,
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
      metadata: {
        provider,
      },
    });

    this.logger.log("Social account unlinked", {
      userId,
      provider,
    });

    return {
      success: true,
      message: `${provider} account unlinked successfully`,
    };
  }

  /**
   * Get user's social connections
   */
  async getUserConnections(
    userId: string,
    tenantId: string,
  ): Promise<UserSocialConnection[]> {
    return this.socialConnectionRepository.find({
      where: {
        userId,
        tenantId,
      },
      select: [
        "id",
        "provider",
        "email",
        "displayName",
        "avatarUrl",
        "primary",
        "lastUsedAt",
        "createdAt",
      ],
      order: {
        primary: "DESC",
        lastUsedAt: "DESC",
      },
    });
  }

  /**
   * Create a short-lived link token for authenticated social account linking.
   * The token encodes userId + tenantId and expires in 60 seconds.
   */
  async createLinkToken(
    userId: string,
    tenantId: string,
  ): Promise<{ linkToken: string }> {
    const linkToken = await this.signToken(
      { userId, tenantId, mode: "link" },
      "60s",
      tenantId,
    );
    return { linkToken };
  }

  /**
   * Verify and decode a link token. Throws UnauthorizedException if invalid/expired.
   */
  async verifyLinkToken(token: string): Promise<{ userId: string; tenantId: string }> {
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      const payload = this.jwtService.verify(token, {
        publicKey: publicKey as any,
        algorithms: ["RS256"],
      }) as { userId?: string; tenantId?: string; mode?: string };
      if (payload.mode !== "link" || !payload.userId || !payload.tenantId) {
        throw new Error("Not a link token");
      }
      return { userId: payload.userId, tenantId: payload.tenantId };
    } catch {
      throw new ApiException("AUTH_TOKEN_INVALID");
    }
  }

  /**
   * Directly link a social account to an already-authenticated user.
   * Called when the OAuth callback detects state.mode === "link".
   */
  async handleLinkCallback(params: {
    userId: string;
    tenantId: string;
    profile: SocialProfile;
  }): Promise<{ provider: string }> {
    const { userId, tenantId, profile } = params;

    // A provider identity binds to exactly one user per tenant.
    const existing = await this.socialConnectionRepository.findOne({
      where: {
        tenantId,
        provider: profile.provider,
        providerId: profile.providerId,
      },
    });
    if (existing) {
      if (existing.userId !== userId) {
        throw new ApiException("RESOURCE_CONFLICT", {
          detail: "This provider account is already linked to a different user.",
        });
      }
      // Idempotent — already linked to this user
      return { provider: profile.provider };
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });
    if (!user) throw new ApiException("RESOURCE_NOT_FOUND", { detail: "User not found" });

    const connection = this.socialConnectionRepository.create({
      userId,
      tenantId,
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      primary: false,
    });
    await this.socialConnectionRepository.save(connection);

    this.logger.log(`Linked ${profile.provider} account for user ${userId}`);
    return { provider: profile.provider };
  }
}
