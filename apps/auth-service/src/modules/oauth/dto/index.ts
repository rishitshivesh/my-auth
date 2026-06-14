// apps/auth-service/src/modules/oauth/dto/index.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsBoolean,
  IsArray,
  IsNumber,
  IsUrl,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

// ============================================================
// USERINFO ENDPOINT
// ============================================================

/**
 * UserInfo Response DTO
 * GET /oauth/userinfo
 */
export class UserInfoResponseDto {
  @ApiProperty({
    description: "Subject (user ID)",
    example: "user_abc123",
  })
  sub!: string;

  @ApiProperty({
    description: "Email address",
    example: "user@example.com",
  })
  email!: string;

  @ApiProperty({
    description: "Email verified",
    example: true,
  })
  email_verified!: boolean;

  @ApiPropertyOptional({
    description: "Full name",
    example: "John Doe",
  })
  name?: string;

  @ApiPropertyOptional({
    description: "Given name",
    example: "John",
  })
  given_name?: string;

  @ApiPropertyOptional({
    description: "Family name",
    example: "Doe",
  })
  family_name?: string;

  @ApiPropertyOptional({
    description: "Profile picture URL",
    example: "https://example.com/avatar.jpg",
  })
  picture?: string;

  @ApiPropertyOptional({
    description: "Last updated timestamp",
    example: 1234567890,
  })
  updated_at?: number;
}

// ============================================================
// REVOKE ENDPOINT
// ============================================================

/**
 * Revoke Token Request DTO
 * POST /oauth/revoke
 */
export class RevokeTokenRequestDto {
  @ApiProperty({
    description: "Token to revoke",
    example: "token_to_revoke",
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({
    description: "Token type hint",
    enum: ["access_token", "refresh_token"],
    example: "access_token",
  })
  @IsString()
  @IsIn(["access_token", "refresh_token"])
  @IsOptional()
  token_type_hint?: "access_token" | "refresh_token";
}

// ============================================================
// INTROSPECT ENDPOINT
// ============================================================

/**
 * Introspect Token Request DTO
 * POST /oauth/introspect
 */
export class IntrospectTokenRequestDto {
  @ApiProperty({
    description: "Token to introspect",
    example: "token_to_check",
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({
    description: "Token type hint",
    enum: ["access_token", "refresh_token"],
    example: "access_token",
  })
  @IsString()
  @IsIn(["access_token", "refresh_token"])
  @IsOptional()
  token_type_hint?: "access_token" | "refresh_token";
}

/**
 * Introspect Token Response DTO
 */
export class IntrospectTokenResponseDto {
  @ApiProperty({
    description: "Whether token is active",
    example: true,
  })
  active!: boolean;

  @ApiPropertyOptional({
    description: "Scope",
    example: "openid profile email",
  })
  scope?: string;

  @ApiPropertyOptional({
    description: "Client ID",
    example: "client_abc123",
  })
  client_id?: string;

  @ApiPropertyOptional({
    description: "Username",
    example: "user@example.com",
  })
  username?: string;

  @ApiPropertyOptional({
    description: "Token type",
    example: "Bearer",
  })
  token_type?: string;

  @ApiPropertyOptional({
    description: "Expiration timestamp",
    example: 1234567890,
  })
  exp?: number;

  @ApiPropertyOptional({
    description: "Issued at timestamp",
    example: 1234567000,
  })
  iat?: number;

  @ApiPropertyOptional({
    description: "Subject",
    example: "user_abc123",
  })
  sub?: string;

  @ApiPropertyOptional({
    description: "Audience",
    example: "client_abc123",
  })
  aud?: string;
}

// ============================================================
// CLIENT MANAGEMENT
// ============================================================

/**
 * Create OAuth Client Request DTO
 * POST /oauth/clients
 */
export class CreateOAuthClientDto {
  @ApiProperty({
    description: "Client name",
    example: "My Application",
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: "Client description",
    example: "A sample OAuth2 client",
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: "Client type",
    enum: ["confidential", "public"],
    example: "public",
  })
  @IsString()
  @IsIn(["confidential", "public"])
  clientType!: "confidential" | "public";

  @ApiProperty({
    description: "Allowed grant types",
    example: ["authorization_code", "refresh_token"],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  grantTypes!: string[];

  @ApiProperty({
    description: "Redirect URIs",
    example: ["https://app.example.com/callback"],
    isArray: true,
  })
  @IsArray()
  @IsUrl({}, { each: true })
  redirectUris!: string[];

  @ApiPropertyOptional({
    description: "Post logout redirect URIs",
    example: ["https://app.example.com/logout"],
    isArray: true,
  })
  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  postLogoutRedirectUris?: string[];

  @ApiPropertyOptional({
    description: "Allowed CORS origins",
    example: ["https://app.example.com"],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedOrigins?: string[];

  @ApiPropertyOptional({
    description: "Logo URL",
    example: "https://app.example.com/logo.png",
  })
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: "Website URL",
    example: "https://app.example.com",
  })
  @IsUrl()
  @IsOptional()
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: "Privacy policy URL",
    example: "https://app.example.com/privacy",
  })
  @IsUrl()
  @IsOptional()
  privacyPolicyUrl?: string;

  @ApiPropertyOptional({
    description: "Terms of service URL",
    example: "https://app.example.com/terms",
  })
  @IsUrl()
  @IsOptional()
  termsOfServiceUrl?: string;

  @ApiPropertyOptional({
    description: "Allowed scopes",
    example: ["openid", "profile", "email"],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedScopes?: string[];

  @ApiPropertyOptional({
    description: "Default scopes",
    example: ["openid", "profile"],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  defaultScopes?: string[];

  @ApiPropertyOptional({
    description: "Require PKCE",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  requirePkce?: boolean;

  @ApiPropertyOptional({
    description: "Require consent screen",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  requireConsent?: boolean;

  @ApiPropertyOptional({
    description: "Access token TTL in seconds",
    example: 900,
  })
  @IsNumber()
  @IsOptional()
  accessTokenTtl?: number;

  @ApiPropertyOptional({
    description: "Refresh token TTL in seconds",
    example: 604800,
  })
  @IsNumber()
  @IsOptional()
  refreshTokenTtl?: number;

  @ApiPropertyOptional({
    description: "ID token TTL in seconds",
    example: 3600,
  })
  @IsNumber()
  @IsOptional()
  idTokenTtl?: number;
}

/**
 * Update OAuth Client Request DTO
 * PATCH /oauth/clients/:clientId
 */
export class UpdateOAuthClientDto {
  @ApiPropertyOptional({
    description: "Client name",
    example: "My Updated Application",
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: "Client description",
    example: "Updated description",
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: "Redirect URIs",
    example: ["https://app.example.com/callback"],
    isArray: true,
  })
  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  redirectUris?: string[];

  @ApiPropertyOptional({
    description: "Logo URL",
    example: "https://app.example.com/new-logo.png",
  })
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: "Is active",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Allowed scopes",
    example: ["openid", "profile", "email"],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedScopes?: string[];
}

/**
 * OAuth Client Response DTO
 */
export class OAuthClientResponseDto {
  @ApiProperty({
    description: "Client ID",
    example: "client_abc123",
  })
  id!: string;

  @ApiProperty({
    description: "Client ID (public)",
    example: "client_abc123",
  })
  clientId!: string;

  @ApiProperty({
    description: "Client name",
    example: "My Application",
  })
  name!: string;

  @ApiPropertyOptional({
    description: "Client description",
    example: "A sample OAuth2 client",
  })
  description?: string;

  @ApiProperty({
    description: "Client type",
    enum: ["confidential", "public"],
    example: "public",
  })
  clientType!: string;

  @ApiProperty({
    description: "Grant types",
    example: ["authorization_code", "refresh_token"],
    isArray: true,
  })
  grantTypes!: string[];

  @ApiProperty({
    description: "Redirect URIs",
    example: ["https://app.example.com/callback"],
    isArray: true,
  })
  redirectUris!: string[];

  @ApiPropertyOptional({
    description: "Logo URL",
    example: "https://app.example.com/logo.png",
  })
  logoUrl?: string;

  @ApiProperty({
    description: "Is active",
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: "Created at",
    example: "2024-01-01T00:00:00Z",
  })
  createdAt!: Date;
}

/**
 * Create Client Response DTO (includes secret once)
 */
export class CreateClientResponseDto extends OAuthClientResponseDto {
  @ApiPropertyOptional({
    description: "Client secret (only returned once on creation)",
    example: "secret_xyz789_DO_NOT_SHARE",
  })
  clientSecret?: string;
}

// ============================================================
// DISCOVERY ENDPOINT
// ============================================================

/**
 * OpenID Configuration Response DTO
 * GET /.well-known/openid-configuration
 */
export class OpenIDConfigurationDto {
  @ApiProperty({
    description: "Issuer URL",
    example: "https://sentry.scrolloop.com",
  })
  issuer!: string;

  @ApiProperty({
    description: "Authorization endpoint",
    example: "https://sentry.scrolloop.com/oauth/authorize",
  })
  authorization_endpoint!: string;

  @ApiProperty({
    description: "Token endpoint",
    example: "https://sentry.scrolloop.com/oauth/token",
  })
  token_endpoint!: string;

  @ApiProperty({
    description: "UserInfo endpoint",
    example: "https://sentry.scrolloop.com/oauth/userinfo",
  })
  userinfo_endpoint!: string;

  @ApiProperty({
    description: "JWKS URI",
    example: "https://sentry.scrolloop.com/oauth/jwks",
  })
  jwks_uri!: string;

  @ApiPropertyOptional({
    description: "Revocation endpoint",
    example: "https://sentry.scrolloop.com/oauth/revoke",
  })
  revocation_endpoint?: string;

  @ApiPropertyOptional({
    description: "Introspection endpoint",
    example: "https://sentry.scrolloop.com/oauth/introspect",
  })
  introspection_endpoint?: string;

  @ApiProperty({
    description: "Supported response types",
    example: ["code"],
    isArray: true,
  })
  response_types_supported!: string[];

  @ApiProperty({
    description: "Supported grant types",
    example: ["authorization_code", "refresh_token", "client_credentials"],
    isArray: true,
  })
  grant_types_supported!: string[];

  @ApiProperty({
    description: "Supported scopes",
    example: ["openid", "profile", "email", "offline_access"],
    isArray: true,
  })
  scopes_supported!: string[];

  @ApiProperty({
    description: "Supported subject types",
    example: ["public"],
    isArray: true,
  })
  subject_types_supported!: string[];

  @ApiProperty({
    description: "Supported ID token signing algorithms",
    example: ["RS256"],
    isArray: true,
  })
  id_token_signing_alg_values_supported!: string[];

  @ApiProperty({
    description: "Supported token endpoint auth methods",
    example: ["client_secret_basic", "client_secret_post", "none"],
    isArray: true,
  })
  token_endpoint_auth_methods_supported!: string[];

  @ApiProperty({
    description: "Supported code challenge methods",
    example: ["S256", "plain"],
    isArray: true,
  })
  code_challenge_methods_supported!: string[];

  @ApiProperty({
    description: "Supported claims",
    example: [
      "sub",
      "email",
      "email_verified",
      "name",
      "given_name",
      "family_name",
      "picture",
    ],
    isArray: true,
  })
  claims_supported!: string[];
}

// ============================================================
// JWKS ENDPOINT
// ============================================================

/**
 * JSON Web Key Set Response DTO
 * GET /oauth/jwks
 */
export class JWKSResponseDto {
  @ApiProperty({
    description: "Array of JSON Web Keys",
    isArray: true,
  })
  keys!: JWKDto[];
}

export class JWKDto {
  @ApiProperty({
    description: "Key type",
    example: "RSA",
  })
  kty!: string;

  @ApiProperty({
    description: "Public key use",
    example: "sig",
  })
  use!: string;

  @ApiProperty({
    description: "Key ID",
    example: "key_1",
  })
  kid!: string;

  @ApiProperty({
    description: "Algorithm",
    example: "RS256",
  })
  alg!: string;

  @ApiProperty({
    description: "RSA modulus",
    example: "0vx7agoebGcQSuuPiLJXZptN...",
  })
  n!: string;

  @ApiProperty({
    description: "RSA exponent",
    example: "AQAB",
  })
  e!: string;
}

// Re-export token DTOs
export * from "./authorize.dto";
export * from "./token.dto";
