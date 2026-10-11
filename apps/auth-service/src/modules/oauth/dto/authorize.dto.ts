// apps/auth-service/src/modules/oauth/dto/authorize.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Matches,
} from "class-validator";
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
  @IsString()
  @IsIn(["S256"], { message: "code_challenge_method must be S256" })
  @IsOptional()
  code_challenge_method?: "S256";
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
