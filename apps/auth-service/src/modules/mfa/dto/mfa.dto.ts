import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNotEmpty, Length, Matches } from "class-validator";

// ============================================================
// SETUP DTOs
// ============================================================

export class SetupTotpResponseDto {
  @ApiProperty({ description: "TOTP secret (base32 encoded)" })
  secret!: string;

  @ApiProperty({ description: "QR code as data URL" })
  qrCode!: string;

  @ApiProperty({ description: "Backup codes (save these!)", type: [String] })
  backupCodes!: string[];
}

// ============================================================
// VERIFICATION DTOs
// ============================================================

export class VerifyTotpDto {
  @ApiProperty({ example: "123456", description: "6-digit TOTP code" })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: "Token must be 6 digits" })
  token!: string;
}

export class VerifyBackupCodeDto {
  @ApiProperty({ example: "ABCD-1234", description: "Backup code" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, {
    message: "Invalid backup code format",
  })
  code!: string;
}

// ============================================================
// MFA AUTH DTOs (for login flow)
// ============================================================

export class MfaVerifyDto {
  @ApiProperty({ description: "Temporary token from login" })
  @IsString()
  @IsNotEmpty()
  tempToken!: string;

  @ApiProperty({ example: "123456", description: "6-digit TOTP code" })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: "Token must be 6 digits" })
  code!: string;
}

export class MfaVerifyBackupDto {
  @ApiProperty({ description: "Temporary token from login" })
  @IsString()
  @IsNotEmpty()
  tempToken!: string;

  @ApiProperty({ example: "ABCD-1234", description: "Backup code" })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

// ============================================================
// RESPONSE DTOs
// ============================================================

export class MfaStatusDto {
  @ApiProperty({ description: "Whether MFA is enabled" })
  enabled!: boolean;

  @ApiProperty({ description: "Enabled MFA methods", type: [String] })
  methods!: string[];

  @ApiProperty({ description: "Preferred MFA method" })
  preferredMethod?: string;

  @ApiProperty({ description: "Number of backup codes remaining" })
  backupCodesRemaining!: number;
}

export class MfaEnabledResponseDto {
  @ApiProperty({ description: "Success message" })
  message!: string;

  @ApiProperty({ description: "Backup codes (save these!)", type: [String] })
  backupCodes!: string[];
}

export class BackupCodesResponseDto {
  @ApiProperty({ description: "New backup codes", type: [String] })
  backupCodes!: string[];

  @ApiProperty({ description: "Number of codes generated" })
  count!: number;
}

/** Body of POST /mfa/verify-email-otp. */
export class VerifyEmailOtpDto {
  @ApiProperty({ example: "123456", description: "6-digit code from the email" })
  @IsString()
  @Matches(/^\d{6}$/, { message: "code must be a 6-digit code" })
  code!: string;
}
