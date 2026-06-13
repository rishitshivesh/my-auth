// apps/auth-service/src/modules/mfa/mfa.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MfaSettings, User, SecurityEventType } from "@repo/database";
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

@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(MfaSettings)
    private mfaRepository: Repository<MfaSettings>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly securityEventService: SecurityEventService,
  ) {}

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
      throw new NotFoundException("User not found");
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `FortKnox (${user.email})`,
      issuer: "Fort Knox Auth",
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

    // Store secret (not yet verified)
    mfaSettings.totpSecret = secret.base32;
    await this.mfaRepository.save(mfaSettings);

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

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
  ): Promise<{ backupCodes: string[] }> {
    // addSelect() is required to load select:false columns in TypeORM 0.3.x
    const mfaSettings = await this.mfaRepository
      .createQueryBuilder("mfa")
      .addSelect("mfa.totpSecret")
      .where("mfa.userId = :userId", { userId })
      .andWhere("mfa.tenantId = :tenantId", { tenantId })
      .getOne();

    if (!mfaSettings || !mfaSettings.totpSecret) {
      throw new BadRequestException(
        "TOTP not set up. Call /mfa/setup/totp first",
      );
    }

    if (mfaSettings.totpEnabled) {
      throw new BadRequestException("TOTP already enabled");
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: mfaSettings.totpSecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      throw new UnauthorizedException("Invalid TOTP token");
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
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });

    return { backupCodes };
  }

  /**
   * Verify TOTP token during login
   */
  async verifyTotp(
    userId: string,
    tenantId: string,
    token: string,
  ): Promise<boolean> {
    const mfaSettings = await this.mfaRepository
      .createQueryBuilder("mfa")
      .addSelect("mfa.totpSecret")
      .where("mfa.userId = :userId", { userId })
      .andWhere("mfa.tenantId = :tenantId", { tenantId })
      .andWhere("mfa.totpEnabled = :enabled", { enabled: true })
      .getOne();

    if (!mfaSettings || !mfaSettings.totpSecret) {
      throw new BadRequestException("TOTP not enabled for this user");
    }

    const verified = speakeasy.totp.verify({
      secret: mfaSettings.totpSecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      logger.warn({ userId }, "Invalid TOTP token for user");
      return false;
    }

    logger.info({ userId }, "TOTP verified for user");
    return true;
  }

  /**
   * Disable TOTP MFA
   */
  async disableTotp(userId: string, tenantId: string): Promise<void> {
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      throw new NotFoundException("MFA settings not found");
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
      ipAddress: "0.0.0.0",
      userAgent: "system",
    });
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
  ): Promise<boolean> {
    const mfaSettings = await this.mfaRepository
      .createQueryBuilder("mfa")
      .addSelect("mfa.backupCodes")
      .where("mfa.userId = :userId", { userId })
      .andWhere("mfa.tenantId = :tenantId", { tenantId })
      .getOne();

    if (!mfaSettings || !mfaSettings.backupCodes) {
      throw new BadRequestException("No backup codes available");
    }

    let codeIndex = -1;
    for (let i = 0; i < mfaSettings.backupCodes.length; i++) {
      const matches = await PasswordService.verify(
        mfaSettings.backupCodes[i],
        code,
      );
      if (matches) {
        codeIndex = i;
        break;
      }
    }

    if (codeIndex === -1) {
      logger.warn({ userId }, "Invalid backup code for user");
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
      throw new NotFoundException("MFA settings not found");
    }

    if (!mfaSettings.totpEnabled) {
      throw new BadRequestException(
        "MFA must be enabled to generate backup codes",
      );
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
   * Get MFA status for user
   */
  async getMfaStatus(userId: string, tenantId: string) {
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      return {
        enabled: false,
        methods: [],
      };
    }

    const methods: string[] = [];
    if (mfaSettings.totpEnabled) methods.push("totp");
    if (mfaSettings.smsEnabled) methods.push("sms");
    if (mfaSettings.emailEnabled) methods.push("email");
    if (mfaSettings.webauthnEnabled) methods.push("webauthn");

    return {
      enabled: methods.length > 0,
      methods,
      preferredMethod: mfaSettings.preferredMethod || methods[0],
      backupCodesRemaining: mfaSettings.backupCodes?.length || 0,
    };
  }

  /**
   * Disable all MFA methods
   */
  async disableAllMfa(userId: string, tenantId: string): Promise<void> {
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
