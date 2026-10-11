import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * `response` is the raw WebAuthn registration response from the browser;
 * `@simplewebauthn/server` performs its own structural verification on it,
 * so it is validated here only as an object, not re-modeled field by field.
 */
export class FinishWebAuthnRegistrationDto {
  @ApiProperty({
    description: "WebAuthn registration response from browser",
    type: "object",
    additionalProperties: true,
  })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiPropertyOptional({ example: "YubiKey 5" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
