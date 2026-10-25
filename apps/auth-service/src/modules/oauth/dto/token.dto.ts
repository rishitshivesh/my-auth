import { IsString, IsNotEmpty, IsOptional, IsIn } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Token Request DTO (Authorization Code Grant)
 * POST /oauth/token
 */
export class TokenRequestDto {
  @ApiProperty({
    description: "OAuth2 grant type",
    enum: ["authorization_code", "refresh_token", "client_credentials"],
    example: "authorization_code",
  })
  @IsString()
  @IsOptional()
  grant_type?: string;

  @ApiPropertyOptional({
    description: "Authorization code (for authorization_code grant)",
    example: "auth_code_abc123",
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    description: "Redirect URI (must match authorization request)",
    example: "https://app.example.com/callback",
  })
  @IsString()
  @IsOptional()
  redirect_uri?: string;

  @ApiPropertyOptional({
    description: "Refresh token (for refresh_token grant)",
    example: "refresh_token_xyz789",
  })
  @IsString()
  @IsOptional()
  refresh_token?: string;

  @ApiProperty({
    description: "OAuth2 client ID",
    example: "client_abc123",
  })
  @IsString()
  @IsOptional()
  client_id?: string;

  @ApiPropertyOptional({
    description: "OAuth2 client secret (for confidential clients)",
    example: "secret_xyz789",
  })
  @IsString()
  @IsOptional()
  client_secret?: string;

  @ApiPropertyOptional({
    description: "PKCE code verifier (for public clients)",
    example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  })
  @IsString()
  @IsOptional()
  code_verifier?: string;

  @ApiPropertyOptional({
    description: "Requested scopes (for client_credentials grant)",
    example: "api:read api:write",
  })
  @IsString()
  @IsOptional()
  scope?: string;
}

/**
 * Token Response DTO
 */
export class TokenResponseDto {
  @ApiProperty({
    description: "Access token (JWT)",
    example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  access_token!: string;

  @ApiProperty({
    description: "Token type",
    example: "Bearer",
  })
  token_type!: string;

  @ApiProperty({
    description: "Expiration time in seconds",
    example: 900,
  })
  expires_in!: number;

  @ApiPropertyOptional({
    description: "Refresh token (opaque)",
    example: "refresh_token_xyz789",
  })
  refresh_token?: string;

  @ApiPropertyOptional({
    description: "ID token (JWT, OIDC only)",
    example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  id_token?: string;

  @ApiPropertyOptional({
    description: "Granted scopes",
    example: "openid profile email",
  })
  scope?: string;
}

/**
 * Token Error Response DTO
 */
export class TokenErrorResponseDto {
  @ApiProperty({
    description: "Error code",
    enum: [
      "invalid_request",
      "invalid_client",
      "invalid_grant",
      "unauthorized_client",
      "unsupported_grant_type",
      "invalid_scope",
    ],
    example: "invalid_grant",
  })
  error!: string;

  @ApiPropertyOptional({
    description: "Human-readable error description",
    example: "The provided authorization code is invalid",
  })
  error_description?: string;

  @ApiPropertyOptional({
    description: "URI with error information",
    example: "https://docs.scrolloop.com/errors/invalid_grant",
  })
  error_uri?: string;
}
