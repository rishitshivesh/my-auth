import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateTenantDto {
  @ApiProperty({ example: "Acme Corp" })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    example: "acme",
    pattern: "^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$",
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/, {
    message:
      "slug must be 4-63 characters, lowercase letters/numbers/hyphens, and cannot start or end with a hyphen",
  })
  slug!: string;

  @ApiPropertyOptional({ example: "free" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;

  @ApiPropertyOptional({ example: "owner@acme.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  ownerEmail?: string;

  @ApiPropertyOptional({ example: "production" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  environment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  useCurrentUserAsAdmin?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  migrateProfile?: boolean;
}
