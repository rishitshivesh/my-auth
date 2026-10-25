// apps/auth-service/src/modules/oauth/dto/authorize.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  IsBoolean,
  Matches,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Authorization Request DTO
 * GET /oauth/authorize
 */
export class AuthorizeRequestDto {
  @ApiProperty({
    description: "OAuth2 client ID",
    example: "client_abc123",
  })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({
    description: "OAuth2 redirect URI",
    example: "https://app.example.com/callback",
  })
  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;

  @ApiProperty({
    description: "OAuth2 response type",
    enum: ["code"],
    example: "code",
  })
  @IsString()
  @IsIn(["code"])
  response_type!: "code";

  @ApiProperty({
    description: "Space-separated list of scopes",
    example: "openid profile email",
  })
  @IsString()
  @IsNotEmpty()
  scope!: string;

  @ApiPropertyOptional({
    description: "OAuth2 state parameter for CSRF protection",
    example: "random_state_xyz",
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({
    description: "OIDC nonce parameter for replay protection",
    example: "random_nonce_abc",
  })
  @IsString()
  @IsOptional()
  nonce?: string;

  @ApiPropertyOptional({
    description: "PKCE code challenge",
    example: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  })
  @IsString()
  @Matches(/^[A-Za-z0-9\-._~]{43,128}$/, {
    message: "code_challenge must be a base64url S256 challenge (43-128 chars)",
  })
  @IsOptional()
  code_challenge?: string;

  @ApiPropertyOptional({
    description:
      "PKCE code challenge method. Only S256 is supported (OAuth 2.0 Security BCP / OAuth 2.1). " +
      "Required whenever code_challenge is sent, because RFC 7636 defaults an absent method to plain.",
    enum: ["S256"],
    example: "S256",
  })
  // Validated in the controller so a bad method is a standard 400 invalid_request.
  @IsString()
  @IsOptional()
  code_challenge_method?: "S256";

  @ApiPropertyOptional({
    description:
      "OIDC prompt: space-separated subset of none, login, consent, select_account. " +
      "`none` must be used alone.",
    example: "login",
  })
  @IsString()
  @Matches(/^(none|login|consent|select_account)( (none|login|consent|select_account))*$/, {
    message: "prompt must be a space-separated subset of none, login, consent, select_account",
  })
  @IsOptional()
  prompt?: string;

  @ApiPropertyOptional({
    description:
      "OIDC max_age: maximum seconds since the user last authenticated. Older sessions re-authenticate.",
    example: 300,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_age?: number;

  @ApiPropertyOptional({
    description:
      "Internal: epoch seconds. Set on the login `continue` URL after prompt=login so the " +
      "re-authenticated session is required to be newer than this instant.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  auth_after?: number;
}

/** POST /oauth/consent */
export class ConsentDecisionDto {
  @ApiProperty({ description: "Consent transaction id from the consent redirect" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  transaction_id!: string;

  @ApiProperty({ description: "CSRF token returned by GET /oauth/consent/:transaction_id" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  csrf_token!: string;

  @ApiProperty({ enum: ["allow", "deny"] })
  @IsIn(["allow", "deny"])
  decision!: "allow" | "deny";

  @ApiPropertyOptional({ description: "Remember this decision for future requests" })
  @IsBoolean()
  @IsOptional()
  remember?: boolean;
}

/** GET|POST /oauth/end_session (OIDC RP-Initiated Logout 1.0) */
export class EndSessionRequestDto {
  @ApiPropertyOptional({ description: "Previously issued ID token identifying the session to end" })
  @IsString()
  @MaxLength(8192)
  @IsOptional()
  id_token_hint?: string;

  @ApiPropertyOptional({ description: "Must exactly match a registered post-logout redirect URI" })
  @IsString()
  @MaxLength(2048)
  @IsOptional()
  post_logout_redirect_uri?: string;

  @ApiPropertyOptional({ description: "Opaque value echoed on the post-logout redirect" })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ description: "Client the logout is for (must match the id_token_hint audience)" })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  client_id?: string;
}

/**
 * Authorization Response DTO
 * Redirect to redirect_uri with code and state
 */
export class AuthorizeResponseDto {
  @ApiProperty({
    description: "Authorization code",
    example: "auth_code_abc123",
  })
  code!: string;

  @ApiPropertyOptional({
    description: "State parameter (echoed back)",
    example: "random_state_xyz",
  })
  state?: string;
}
