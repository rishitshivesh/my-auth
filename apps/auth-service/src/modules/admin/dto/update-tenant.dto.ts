import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTenantDto {
  @ApiPropertyOptional({ enum: ["active", "suspended"] })
  @IsOptional()
  @IsIn(["active", "suspended"])
  status?: string;

  @ApiPropertyOptional({ example: "Acme Corp" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: "pro" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;
}
