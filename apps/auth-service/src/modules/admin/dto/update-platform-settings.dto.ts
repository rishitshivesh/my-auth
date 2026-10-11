import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ example: "Scrolloop Sentry" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platformName?: string;

  @ApiPropertyOptional({ example: "smtp.sendgrid.net" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @ApiPropertyOptional({ example: "support@scrolloop.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  supportEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowPublicSignup?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;
}
