import {
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsObject,
  MaxLength,
} from "class-validator";

export class RegisterSPDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  entityId!: string;

  @IsUrl({ require_tld: false })
  acsUrl!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  sloUrl?: string;

  @IsOptional()
  @IsString()
  certificate?: string;

  @IsOptional()
  @IsString()
  nameIdFormat?: string;

  @IsOptional()
  @IsObject()
  attributeMapping?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  signAssertions?: boolean;

  @IsOptional()
  @IsBoolean()
  encryptAssertions?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false })
  metadataUrl?: string;
}

export class UpdateSPDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  acsUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  sloUrl?: string;

  @IsOptional()
  @IsString()
  certificate?: string;

  @IsOptional()
  @IsObject()
  attributeMapping?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  signAssertions?: boolean;
}
