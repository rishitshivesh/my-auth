import {
  IsUrl,
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  ArrayNotEmpty,
} from "class-validator";

export class CreateWebhookDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class RotateWebhookSecretDto {
  @IsString()
  @MinLength(1)
  confirm!: string;
}
