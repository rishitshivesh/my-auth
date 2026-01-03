import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsNotEmpty,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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


export class RefreshTokenDto {
  @ApiProperty({ example: "refresh-token-here" })
  @IsString()
  refreshToken!: string;
}


/**
 * Login Intent Request DTO
 */
export class LoginIntentRequestDto {
  @ApiProperty({
    description: 'Email address to check for available authentication methods',
    example: 'john@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

/**
 * Authentication Methods
 */
export class AuthMethodsDto {
  @ApiProperty({
    description: 'Whether password authentication is available',
    example: true,
  })
  password: boolean;

  @ApiProperty({
    description: 'Whether magic link authentication is available',
    example: true,
  })
  magicLink: boolean;

  @ApiProperty({
    description: 'Whether passkey (WebAuthn) authentication is available',
    example: false,
  })
  passkey: boolean;

  @ApiProperty({
    description: 'Whether multi-factor authentication is required',
    example: true,
  })
  mfa: boolean;

  @ApiProperty({
    description: 'List of available social authentication providers',
    example: ['google', 'github', 'microsoft'],
    type: [String],
  })
  social: string[];
}

/**
 * Tenant Branding (for Login Intent)
 */
export class LoginBrandingDto {
  @ApiPropertyOptional({
    description: 'URL to company logo',
    example: 'https://cdn.example.com/logo.png',
  })
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'URL to favicon',
    example: 'https://cdn.example.com/favicon.ico',
  })
  faviconUrl?: string;

  @ApiPropertyOptional({
    description: 'Primary brand color',
    example: '#0066FF',
  })
  primaryColor?: string;

  @ApiPropertyOptional({
    description: 'Background color',
    example: '#FFFFFF',
  })
  backgroundColor?: string;

  @ApiPropertyOptional({
    description: 'Text color',
    example: '#000000',
  })
  textColor?: string;

  @ApiPropertyOptional({
    description: 'Button background color',
    example: '#0066FF',
  })
  buttonColor?: string;

  @ApiPropertyOptional({
    description: 'Button text color',
    example: '#FFFFFF',
  })
  buttonTextColor?: string;

  @ApiPropertyOptional({
    description: 'Company display name',
    example: 'Acme Corporation',
  })
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Support email',
    example: 'support@acme.com',
  })
  supportEmail?: string;

  @ApiPropertyOptional({
    description: 'Privacy policy URL',
    example: 'https://acme.com/privacy',
  })
  privacyPolicyUrl?: string;

  @ApiPropertyOptional({
    description: 'Terms of service URL',
    example: 'https://acme.com/terms',
  })
  termsOfServiceUrl?: string;
}

/**
 * Login Intent Response DTO
 */
export class LoginIntentResponseDto {
  @ApiProperty({
    description: 'Whether a user with this email exists',
    example: true,
  })
  exists: boolean;

  @ApiProperty({
    description: 'Email address that was checked',
    example: 'john@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Available authentication methods for this user',
    type: AuthMethodsDto,
  })
  methods: AuthMethodsDto;

  @ApiPropertyOptional({
    description: 'Preferred authentication method (recommended to show first)',
    example: 'password',
    enum: ['password', 'magicLink', 'passkey', 'social'],
  })
  preferredMethod?: 'password' | 'magicLink' | 'passkey' | 'social';

  @ApiPropertyOptional({
    description: 'Tenant branding configuration for UI customization',
    type: LoginBrandingDto,
  })
  branding?: LoginBrandingDto;
}