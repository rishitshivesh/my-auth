import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Body of POST /superadmin/create-first-admin.
 *
 * Declared as a class (not an interface) so the global ValidationPipe can
 * validate and whitelist it — an interface-typed @Body() is passed through
 * unvalidated, which previously turned a missing `name` into a 500.
 */
export class CreateFirstAdminDto {
  @ApiPropertyOptional({ example: "Scrolloop Sentry" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platformName?: string;

  @ApiProperty({ example: "Ada Lovelace" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: "admin@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
