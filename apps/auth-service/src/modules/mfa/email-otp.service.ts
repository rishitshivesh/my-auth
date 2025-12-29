import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from "crypto";
import { EmailService } from "@/modules/email/email.service";
import { UserService } from "@/modules/user/user.service";

interface OtpEntry {
  code: string;
  expiresAt: Date;
  attempts: number;
}

@Injectable()
export class EmailOtpService {
  // In-memory store (replace with Redis in production)
  private otpStore = new Map<string, OtpEntry>();

  constructor(
    private readonly emailService: EmailService,
    private readonly userService: UserService,
  ) {
    // Cleanup expired OTPs every 5 minutes
    setInterval(() => this.cleanupExpiredOtps(), 5 * 60 * 1000);
  }

  /**
   * Generate and send OTP via email
   */
  async sendOtp(userId: string, tenantId: string): Promise<void> {
    // Generate 6-digit OTP
    const code = this.generateOtpCode();
    const user = await this.userService.findById(tenantId, userId);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Store OTP (expires in 10 minutes)
    const key = `${userId}:${tenantId}`;
    this.otpStore.set(key, {
      code: await this.hashCode(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    });

    await this.emailService.sendOTPEmail(user, code);

    console.log(`📧 OTP sent to ${user.email} (expires in 10 minutes)`);
  }

  /**
   * Verify OTP code
   */
  async verifyOtp(
    userId: string,
    tenantId: string,
    code: string,
  ): Promise<boolean> {
    const key = `${userId}:${tenantId}`;
    const entry = this.otpStore.get(key);

    if (!entry) {
      console.log("❌ No OTP found for user");
      return false;
    }

    // Check expiration
    if (entry.expiresAt < new Date()) {
      console.log("❌ OTP expired");
      this.otpStore.delete(key);
      return false;
    }

    // Check attempts (max 5)
    if (entry.attempts >= 5) {
      console.log("❌ Too many attempts");
      this.otpStore.delete(key);
      return false;
    }

    // Increment attempts
    entry.attempts++;

    // Verify code
    const hashedCode = await this.hashCode(code);
    if (hashedCode !== entry.code) {
      console.log("❌ Invalid OTP code");
      return false;
    }

    // Valid! Delete OTP (one-time use)
    this.otpStore.delete(key);
    console.log("✅ OTP verified");
    return true;
  }

  /**
   * Generate 6-digit OTP
   */
  private generateOtpCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Hash OTP code for storage
   */
  private async hashCode(code: string): Promise<string> {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  /**
   * Cleanup expired OTPs
   */
  private cleanupExpiredOtps(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.otpStore.entries()) {
      if (entry.expiresAt < now) {
        this.otpStore.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired OTPs`);
    }
  }
}
