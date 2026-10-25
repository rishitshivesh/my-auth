import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsNotEmpty,
  ValidateIf,
  IsIn,
  IsObject,
  IsBoolean,
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
  @MaxLength(128)
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

  @ApiPropertyOptional({ description: "Where to send the user after the link is completed. Validated against the workspace's applications / portal." })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirectUri?: string;
}

/**
 * Reset Password DTO
 */
export class ResetPasswordDto {
  @ApiPropertyOptional({
    description: "Single-use token from the reset email link. When present, email and otp are not needed.",
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token?: string;

  @ApiPropertyOptional({
    example: "user@example.com",
    description: "Fallback flow: email the reset code was sent to. The code is only valid for this account.",
  })
  @ValidateIf((o: ResetPasswordDto) => !o.token)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: "123456", description: "Fallback flow: 6-digit code from the reset email" })
  @ValidateIf((o: ResetPasswordDto) => !o.token)
  @IsString()
  @Matches(/^\d{6}$/, { message: "otp must be a 6-digit code" })
  otp?: string;

  @ApiProperty({ example: "NewSecureP@ssw0rd123!" })
  @IsString()
  @MaxLength(128)
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

export class SendMagicLinkDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: "Where to send the user after the link is completed. Validated against the workspace's applications / portal." })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirectUri?: string;

  @ApiPropertyOptional({ description: "Request a cross-device polling nonce; redeem it at POST /auth/magic-link/poll on this device." })
  @IsOptional()
  @IsBoolean()
  poll?: boolean;
}

export class VerifyMagicLinkDto {
  @ApiProperty({ description: 'Raw magic link token from email URL' })
  @IsString()
  token!: string;
}

/**
 * Query params for GET /auth/providers
 * Tenant is resolved from request context (hostname / X-Tenant-ID header) first;
 * these fields are only used when calling cross-tenant (e.g. superadmin tooling).
 */
export class GetProvidersQueryDto {
  @ApiPropertyOptional({ description: 'Tenant UUID (resolved from context if omitted)', example: 'uuid-here' })
  @IsOptional()
  @IsString()
  tenant_id?: string;

  @ApiPropertyOptional({ description: 'Tenant slug (resolved from context if omitted)', example: 'acme' })
  @IsOptional()
  @IsString()
  tenant_slug?: string;
}

export class SocialProviderDto {
  @ApiProperty({ description: 'Provider identifier', example: 'google' })
  provider!: string;

  @ApiProperty({ description: 'Whether this provider is enabled for the tenant', example: true })
  enabled!: boolean;

  @ApiPropertyOptional({ description: 'Human-readable display name', example: 'Google' })
  displayName?: string;
}

/**
 * Response shape for GET /auth/providers
 */
export class GetProvidersResponseDto {
  @ApiProperty({ description: 'Password login enabled', example: true })
  password!: boolean;

  @ApiProperty({ description: 'Magic link login enabled', example: false })
  magicLink!: boolean;

  @ApiProperty({ description: 'Passkey (WebAuthn) login enabled', example: false })
  passkey!: boolean;

  @ApiProperty({ description: 'Configured social providers', type: [SocialProviderDto] })
  social!: SocialProviderDto[];
}

export class AcceptInviteDto {
  @ApiProperty({ example: 'abc123...', description: '128-hex invite token' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'Jane Doe', description: 'Full name for the new account' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'MySecurePass!123', description: 'Password for the new account' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ValidateResetLinkQueryDto {
  @ApiProperty({ description: "Token from the reset email link" })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}

/** Second-factor step of login. `method` defaults to totp. */
export class MfaVerifyDto {
  @ApiProperty({ description: "mfa_pending token from login / magic link" })
  @IsString()
  tempToken!: string;

  @ApiPropertyOptional({ enum: ["totp", "email", "webauthn"], default: "totp" })
  @IsOptional()
  @IsIn(["totp", "email", "webauthn"])
  method?: "totp" | "email" | "webauthn";

  @ApiPropertyOptional({ description: "6-digit code (totp / email)" })
  @ValidateIf((o: MfaVerifyDto) => o.method !== "webauthn")
  @IsString()
  @MaxLength(16)
  code?: string;

  @ApiPropertyOptional({ description: "method=webauthn: assertion from the browser" })
  @ValidateIf((o: MfaVerifyDto) => o.method === "webauthn")
  @IsObject()
  webauthnResponse?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "method=webauthn: sessionNonce from /auth/mfa/webauthn/start" })
  @ValidateIf((o: MfaVerifyDto) => o.method === "webauthn")
  @IsString()
  sessionNonce?: string;
}

export class MfaTempTokenDto {
  @ApiProperty({ description: "mfa_pending token from login / magic link" })
  @IsString()
  tempToken!: string;
}

/** Pre-session enrollment. The token may instead come from the mfa_enrollment_token cookie. */
export class EnrollTotpSetupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  enrollmentToken?: string;
}

export class EnrollTotpConfirmDto extends EnrollTotpSetupDto {
  @ApiProperty({ example: "123456" })
  @IsString()
  @Matches(/^\d{6}$/, { message: "code must be a 6-digit code" })
  code!: string;
}

export class ReauthDto {
  @ApiProperty({ enum: ["password", "totp", "webauthn"] })
  @IsIn(["password", "totp", "webauthn"])
  method!: "password" | "totp" | "webauthn";

  @ApiPropertyOptional()
  @ValidateIf((o: ReauthDto) => o.method === "password")
  @IsString()
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: ReauthDto) => o.method === "totp")
  @IsString()
  @Matches(/^\d{6}$/, { message: "code must be a 6-digit code" })
  code?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: ReauthDto) => o.method === "webauthn")
  @IsObject()
  webauthnResponse?: Record<string, unknown>;

  @ApiPropertyOptional()
  @ValidateIf((o: ReauthDto) => o.method === "webauthn")
  @IsString()
  sessionNonce?: string;
}

export class PollMagicLinkDto {
  @ApiProperty({ description: "pollingNonce returned by magic-link/send" })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  pollingNonce!: string;
}
