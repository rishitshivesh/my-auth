import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested, IsEmail } from "class-validator";
import { Type } from "class-transformer";

export class ScimNameDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  formatted?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  givenName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  familyName?: string;
}

export class ScimEmailDto {
  @ApiProperty()
  @IsString()
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  primary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
}

export class ScimUserDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  schemas!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty()
  @IsEmail()
  userName!: string;

  @ApiPropertyOptional({ type: ScimNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScimNameDto)
  name?: ScimNameDto;

  @ApiPropertyOptional({ type: [ScimEmailDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScimEmailDto)
  emails?: ScimEmailDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
