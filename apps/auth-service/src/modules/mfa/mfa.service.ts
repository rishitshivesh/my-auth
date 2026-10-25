// apps/auth-service/src/modules/mfa/mfa.service.ts

import { Injectable } from "@nestjs/common";
import { ApiException } from "@/common/http";
import {
  DomainEventName,
  DomainEventsService,
} from "@/common/service/domain-events.service";
import { MfaGuardService, TOTP_STEP_SECONDS } from "./mfa-guard.service";
import { SYSTEM_MFA_CONTEXT, type MfaRequestContext } from "./mfa-context";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MfaSettings, Tenant, User, SecurityEventType } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import * as speakeasy from "speakeasy";
import * as QRCode from "qrcode";
import * as crypto from "crypto";
import { PasswordService } from "@repo/security";
import { logger } from "@/common/logger";

export interface SetupTotpResponse {
  secret: string;
  qrCode: string; // Data URL for QR code
  backupCodes: string[];
}

export interface VerifyTotpDto {
  token: string;
}

const GRACE_DAY_FLAGS: Array<[string, number]> = [
  ["mfa_grace_1d", 1],
  ["mfa_grace_3d", 3],
  ["mfa_grace_5d", 5],
  ["mfa_grace_7d", 7],
  ["mfa_grace_14d", 14],
];

function resolveGraceDays(featureFlags?: Record<string, boolean>): number {
  if (!featureFlags) return 7;
  for (const [flag, days] of GRACE_DAY_FLAGS) {
    if (featureFlags[flag]) return days;
  }
  return 7;
}

@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(MfaSettings)
    private mfaRepository: Repository<MfaSettings>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private readonly securityEventService: SecurityEventService,
    private readonly guard: MfaGuardService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  /**
   * The TOTP time step a code belongs to (within one step of drift), or null.
   * The step is what makes replay detection possible.
   */
  private matchTotpStep(secret: string, token: string): number | null {
    const result = speakeasy.totp.verifyDelta({
      secret,
      encoding: "base32",
      token,
      window: 1,
    });
    if (!result) return null;
    return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + result.delta;
  }

  /** Tells the user (via the notifier) that a factor changed. Never throws. */
  private async notifyMfaChange(
    name: typeof DomainEventName.MFA_ENABLED | typeof DomainEventName.MFA_DISABLED,
    userId: string,
    tenantId: string,
    ctx: MfaRequestContext,
  ): Promise<void> {
    const user = await this.userRepository
      .findOne({ where: { id: userId, tenantId } })
      .catch(() => null);
    this.domainEvents.publish(name, {
      tenantId,
      userId,
      email: user?.email,
      name: user?.firstName ?? undefined,
      ip: ctx.ipAddress,
      requestId: ctx.requestId,
    });
  }

  // ============================================================
  // TOTP (Google Authenticator, Authy, etc.)
  // ============================================================

  /**
   * Generate TOTP secret and QR code for setup
   */
  async setupTotp(
    userId: string,
    tenantId: string,
  ): Promise<SetupTotpResponse> {
    // Get user for email/name
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new ApiException("RESOURCE_NOT_FOUND", { detail: "User not found" });
    }

    const existing = await this.mfaRepository.findOne({ where: { userId, tenantId } });
    if (existing?.totpEnabled) {
      // Re-running setup must not silently swap the secret of an enrolled factor.
      throw new ApiException("MFA_ALREADY_ENABLED");
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Scrolloop Sentry (${user.email})`,
      issuer: "Scrolloop Sentry",
      length: 32,
    });

    // Get or create MFA settings
    let mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      mfaSettings = this.mfaRepository.create({
        userId,
        tenantId,
      });
    }

    // Generate backup codes and persist only their hashes (single-use, see
    // verifyBackupCode) so the codes handed to the user actually work.
    const backupCodes = this.generateBackupCodes();

    // Store secret (not yet verified)
    mfaSettings.totpSecret = secret.base32;
    mfaSettings.backupCodes = await Promise.all(
      backupCodes.map((code) => this.hashBackupCode(code)),
    );
    await this.mfaRepository.save(mfaSettings);

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Verify TOTP token and enable TOTP MFA
   */
  async verifyAndEnableTotp(
    userId: string,
    tenantId: string,
    token: string,
    ctx: MfaRequestContext = SYSTEM_MFA_CONTEXT,
  ): Promise<{ backupCodes: string[] }> {
    // addSelect() is required to load select:false columns in TypeORM 0.3.x
    const mfaSettings = await this.mfaRepository
      .createQueryBuilder("mfa")
      .addSelect("mfa.totpSecret")
      .where("mfa.userId = :userId", { userId })
      .andWhere("mfa.tenantId = :tenantId", { tenantId })
      .getOne();

    if (!mfaSettings || !mfaSettings.totpSecret) {
      throw new ApiException("MFA_NOT_STARTED");
    }

    if (mfaSettings.totpEnabled) {
      throw new ApiException("MFA_ALREADY_ENABLED");
    }

    // Verify token
    const step = this.matchTotpStep(mfaSettings.totpSecret, token);
    if (step === null || !(await this.guard.claimTotpStep(tenantId, userId, step))) {
      throw new ApiException("AUTH_MFA_INVALID");
    }

    // Enable TOTP
    mfaSettings.totpEnabled = true;
    mfaSettings.totpVerifiedAt = new Date();

    // Generate and store backup codes
    const backupCodes = this.generateBackupCodes();
    mfaSettings.backupCodes = await Promise.all(
      backupCodes.map((code) => this.hashBackupCode(code)),
    );

    await this.mfaRepository.save(mfaSettings);

    logger.info({ userId }, "TOTP MFA enabled for user");

    this.securityEventService.log({
      userId,
      tenantId,
      eventType: SecurityEventType.TOTP_ENABLED,
      severity: "info",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    await this.notifyMfaChange(DomainEventName.MFA_ENABLED, userId, tenantId, ctx);

    return { backupCodes };
  }

  /**
   * Verify TOTP token during login
   */
  async verifyTotp(
    userId: string,
    tenantId: string,
    token: string,
    challengeId?: string,
  ): Promise<boolean> {
    if (challengeId) {
      await this.guard.assertChallengeActive(tenantId, challengeId);
    }

    const mfaSettings = await this.mfaRepository
      .createQueryBuilder("mfa")
      .addSelect("mfa.totpSecret")
      .where("mfa.userId = :userId", { userId })
      .andWhere("mfa.tenantId = :tenantId", { tenantId })
      .andWhere("mfa.totpEnabled = :enabled", { enabled: true })
      .getOne();

    if (!mfaSettings || !mfaSettings.totpSecret) {
      throw new ApiException("MFA_NOT_ENABLED");
    }

    // A code is single-use: its time step is spent on the first success.
    const step = this.matchTotpStep(mfaSettings.totpSecret, token);
    const accepted =
      step !== null && (await this.guard.claimTotpStep(tenantId, userId, step));

    if (!accepted) {
      logger.warn({ userId }, "Invalid or replayed TOTP token for user");
      if (challengeId) {
        return this.guard.rejectWrongCode(tenantId, challengeId);
      }
      return false;
    }

    logger.info({ userId }, "TOTP verified for user");
    return true;
  }

  /**
   * Disable TOTP MFA
   */
  async disableTotp(
    userId: string,
    tenantId: string,
    ctx: MfaRequestContext = SYSTEM_MFA_CONTEXT,
  ): Promise<void> {
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      throw new ApiException("MFA_NOT_ENABLED");
    }

    mfaSettings.totpEnabled = false;
    mfaSettings.totpSecret = undefined;
    mfaSettings.totpVerifiedAt = undefined;

    await this.mfaRepository.save(mfaSettings);

    logger.info({ userId }, "TOTP MFA disabled for user");

    this.securityEventService.log({
      userId,
      tenantId,
      eventType: SecurityEventType.TOTP_DISABLED,
      severity: "warning",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    await this.notifyMfaChange(DomainEventName.MFA_DISABLED, userId, tenantId, ctx);
  }

  // ============================================================
  // BACKUP CODES
  // ============================================================

  /**
   * Generate new backup codes
   */
  private generateBackupCodes(count = 10): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      // Generate 8-character code (XXXX-XXXX format)
      const code =
        this.generateRandomString(4) + "-" + this.generateRandomString(4);
      codes.push(code);
    }

    return codes;
  }

  /**
   * Hash backup code for storage
   */
  private async hashBackupCode(code: string): Promise<string> {
    return PasswordService.hash(code);
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(
    userId: string,
    tenantId: string,
    code: string,
    challengeId?: string,
  ): Promise<boolean> {
    if (challengeId) {
      await this.guard.assertChallengeActive(tenantId, challengeId);
    }

    const mfaSettings = await this.mfaRepository
      .createQueryBuilder("mfa")
      .addSelect("mfa.backupCodes")
      .where("mfa.userId = :userId", { userId })
      .andWhere("mfa.tenantId = :tenantId", { tenantId })
      .getOne();

    if (!mfaSettings || !mfaSettings.backupCodes) {
      throw new ApiException("MFA_NOT_ENABLED");
    }

    let codeIndex = -1;
    let matchedStored: string | null = null;
    const sha256Hash = crypto.createHash("sha256").update(code).digest("hex");
    for (let i = 0; i < mfaSettings.backupCodes.length; i++) {
      const stored = mfaSettings.backupCodes[i];
      if (!stored) continue;
      if (stored === sha256Hash) {
        codeIndex = i;
        matchedStored = stored;
        break;
      }
      const matches = await PasswordService.verify(stored, code);
      if (matches) {
        codeIndex = i;
        matchedStored = stored;
        break;
      }
    }

    // Single use even under concurrency: only one request may claim a stored code.
    const storedId =
      matchedStored === null
        ? null
        : crypto.createHash("sha256").update(matchedStored).digest("hex");
    const claimed =
      storedId !== null &&
      (await this.guard.claimRecoveryCode(tenantId, userId, storedId));

    if (!claimed) {
      logger.warn({ userId }, "Invalid backup code for user");
      if (challengeId) {
        return this.guard.rejectWrongCode(tenantId, challengeId);
      }
      return false;
    }

    // Remove used code
    mfaSettings.backupCodes.splice(codeIndex, 1);
    await this.mfaRepository.save(mfaSettings);

    logger.info({ userId }, "Backup code verified for user");
    return true;
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      throw new ApiException("MFA_NOT_ENABLED");
    }

    if (!mfaSettings.totpEnabled) {
      throw new ApiException("MFA_NOT_ENABLED");
    }

    // Generate new codes
    const backupCodes = this.generateBackupCodes();
    mfaSettings.backupCodes = await Promise.all(
      backupCodes.map((code) => this.hashBackupCode(code)),
    );

    await this.mfaRepository.save(mfaSettings);

    logger.info({ userId }, "Backup codes regenerated for user");

    return backupCodes;
  }

  // ============================================================
  // MFA STATUS & MANAGEMENT
  // ============================================================

  /**
   * Check if user has MFA enabled
   */
  async isMfaEnabled(userId: string, tenantId: string): Promise<boolean> {
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      return false;
    }

    return (
      mfaSettings.totpEnabled ||
      mfaSettings.smsEnabled ||
      mfaSettings.emailEnabled ||
      mfaSettings.webauthnEnabled
    );
  }

  /**
   * Get MFA status for user, including server-computed grace period state.
   * Sets mfaGraceStartedAt on first call when MFA is not enrolled —
   * this timestamp is immutable from the client.
   */
  async getMfaStatus(userId: string, tenantId: string) {
    const [mfaSettings, user, tenant] = await Promise.all([
      // backupCodes is a select:false column, so it must be requested explicitly or the count is always 0.
      this.mfaRepository
        .createQueryBuilder("mfa")
        .addSelect("mfa.backupCodes")
        .where("mfa.userId = :userId", { userId })
        .andWhere("mfa.tenantId = :tenantId", { tenantId })
        .getOne(),
      this.userRepository.findOne({ where: { id: userId, tenantId } }),
      this.tenantRepository.findOne({ where: { id: tenantId }, select: ["id", "featureFlags"] }),
    ]);

    const graceDays = resolveGraceDays(tenant?.featureFlags ?? undefined);

    const methods: string[] = [];
    if (mfaSettings?.totpEnabled) methods.push("totp");
    if (mfaSettings?.smsEnabled) methods.push("sms");
    if (mfaSettings?.emailEnabled) methods.push("email");
    if (mfaSettings?.webauthnEnabled) methods.push("webauthn");

    const mfaEnabled = methods.length > 0;

    // Grace period tracking — server-side only, never derived from client storage
    let graceStartedAt: Date | null = user?.mfaGraceStartedAt ?? null;

    if (!mfaEnabled && !graceStartedAt && user) {
      graceStartedAt = new Date();
      await this.userRepository.update(
        { id: userId, tenantId },
        { mfaGraceStartedAt: graceStartedAt },
      );
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let graceExpiresAt: Date | null = null;
    let graceRemaining = graceDays;
    let graceExpired = false;

    if (!mfaEnabled && graceStartedAt) {
      graceExpiresAt = new Date(graceStartedAt.getTime() + graceDays * msPerDay);
      const elapsed = Math.floor((now - graceStartedAt.getTime()) / msPerDay);
      graceRemaining = Math.max(0, graceDays - elapsed);
      graceExpired = graceRemaining === 0;
    }

    // Clear grace timer when MFA is enrolled
    if (mfaEnabled && graceStartedAt && user) {
      await this.userRepository.update(
        { id: userId, tenantId },
        { mfaGraceStartedAt: null },
      );
    }

    return {
      enabled: mfaEnabled,
      methods,
      preferredMethod: mfaSettings?.preferredMethod || methods[0],
      backupCodesRemaining: mfaSettings?.backupCodes?.length || 0,
      grace: {
        startedAt: graceStartedAt?.toISOString() ?? null,
        expiresAt: graceExpiresAt?.toISOString() ?? null,
        daysRemaining: graceRemaining,
        isExpired: graceExpired,
      },
    };
  }

  /**
   * Check if user has any active MFA factor enrolled
   */
  async hasActiveFactor(userId: string, tenantId: string): Promise<boolean> {
    return this.isMfaEnabled(userId, tenantId);
  }

  /**
   * Disable all MFA methods
   */
  async disableAllMfa(
    userId: string,
    tenantId: string,
    ctx: MfaRequestContext = SYSTEM_MFA_CONTEXT,
  ): Promise<void> {
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      return;
    }

    // Disable all methods
    mfaSettings.totpEnabled = false;
    mfaSettings.totpSecret = undefined;
    mfaSettings.smsEnabled = false;
    mfaSettings.emailEnabled = false;
    mfaSettings.webauthnEnabled = false;
    mfaSettings.backupCodes = [];

    await this.mfaRepository.save(mfaSettings);

    logger.info({ userId }, "All MFA methods disabled for user");

    this.securityEventService.log({
      userId,
      tenantId,
      eventType: SecurityEventType.TOTP_DISABLED,
      severity: "warning",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { scope: "all_methods" },
    });
    await this.notifyMfaChange(DomainEventName.MFA_DISABLED, userId, tenantId, ctx);
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Generate random alphanumeric string
   */
  private generateRandomString(length: number): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude similar chars
    let result = "";
    const bytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      result += chars[(bytes[i] as any) % chars.length];
    }

    return result;
  }
}
