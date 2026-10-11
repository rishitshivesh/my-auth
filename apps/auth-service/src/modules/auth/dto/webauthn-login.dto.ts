import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsObject, IsString, MaxLength } from "class-validator";

export class StartWebAuthnLoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

/**
 * `response` is the raw WebAuthn authentication response from the browser;
 * `@simplewebauthn/server` performs its own structural verification on it,
 * so it is validated here only as an object, not re-modeled field by field.
 */
export class FinishWebAuthnLoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    description: "WebAuthn authentication response from browser",
    type: "object",
    additionalProperties: true,
  })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  sessionNonce!: string;
}
