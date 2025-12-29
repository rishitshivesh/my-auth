import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsNotEmpty,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Register DTO
 */
export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "SecureP@ssw0rd123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      "Password must contain uppercase, lowercase, number and special character",
  })
  password!: string;

  @ApiProperty({ example: "tenant-uuid", required: false })
  @IsString()
  @IsOptional()
  tenantId?: string;

  @ApiProperty({ example: "John", required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: "Doe", required: false })
  @IsString()
  @IsOptional()
  lastName?: string;
}

/**
 * Login DTO
 */
export class LoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "SecureP@ssw0rd123!" })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ example: "tenant-uuid", required: false })
  @IsString()
  @IsOptional()
  tenantId?: string;
}

/**
 * Forgot Password DTO
 */
export class ForgotPasswordDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;
}

/**
 * Reset Password DTO
 */
export class ResetPasswordDto {
  @ApiProperty({ example: "reset-token-here" })
  @IsString()
  token!: string;

  @ApiProperty({ example: "NewSecureP@ssw0rd123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      "Password must contain uppercase, lowercase, number and special character",
  })
  password!: string;
}

/**
 * Verify Email DTO
 */
export class VerifyEmailDto {
  @ApiProperty({ example: "verification-token-here" })
  @IsString()
  token!: string;
}

export class VerifyMfaDto {
  @ApiProperty({ example: "verification-token-here" })
  @IsString()
  tempToken!: string;

  @ApiProperty({ example: "verification-code-here" })
  @IsString()
  code!: string;
}
