import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ScimPatchOpDto {
  @ApiProperty({ enum: ["add", "remove", "replace"] })
  @IsIn(["add", "remove", "replace"])
  op!: "add" | "remove" | "replace";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  value?: unknown;
}

export class ScimPatchRequestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  schemas!: string[];

  @ApiProperty({ type: [ScimPatchOpDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScimPatchOpDto)
  Operations!: ScimPatchOpDto[];
}
