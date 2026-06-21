import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  Matches,
} from "class-validator";

export class CreateLdapConnectionDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(512)
  host!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsString()
  bindDn!: string;

  @IsString()
  bindPassword!: string;

  @IsString()
  baseDn!: string;

  @IsOptional()
  @IsString()
  userFilter?: string;

  @IsOptional()
  @IsString()
  groupFilter?: string;

  @IsOptional()
  @IsString()
  emailAttribute?: string;

  @IsOptional()
  @IsString()
  displayNameAttribute?: string;

  @IsOptional()
  @IsString()
  firstNameAttribute?: string;

  @IsOptional()
  @IsString()
  lastNameAttribute?: string;

  @IsOptional()
  @IsString()
  syncSchedule?: string;

  @IsOptional()
  @IsBoolean()
  useTls?: boolean;
}

export class UpdateLdapConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  bindPassword?: string;

  @IsOptional()
  @IsString()
  userFilter?: string;

  @IsOptional()
  @IsString()
  groupFilter?: string;

  @IsOptional()
  @IsString()
  syncSchedule?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  useTls?: boolean;
}
