import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSocialProviderDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientSecret?: string;
}
