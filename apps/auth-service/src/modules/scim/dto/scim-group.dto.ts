import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class ScimGroupMemberDto {
  @ApiProperty()
  @IsString()
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  display?: string;
}

export class ScimGroupDto {
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
  @IsString()
  displayName!: string;

  @ApiPropertyOptional({ type: [ScimGroupMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScimGroupMemberDto)
  members?: ScimGroupMemberDto[];
}
