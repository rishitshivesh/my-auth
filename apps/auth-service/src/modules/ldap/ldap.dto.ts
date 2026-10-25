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

// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f]*$/;

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
  @MaxLength(1024)
  @Matches(NO_CONTROL_CHARS, { message: "must not contain control characters" })
  userFilter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(NO_CONTROL_CHARS, { message: "must not contain control characters" })
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
  @MaxLength(1024)
  @Matches(NO_CONTROL_CHARS, { message: "must not contain control characters" })
  userFilter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(NO_CONTROL_CHARS, { message: "must not contain control characters" })
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
