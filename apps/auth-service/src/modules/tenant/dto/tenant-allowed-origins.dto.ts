import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsString, MaxLength } from "class-validator";
import { MAX_TENANT_ALLOWED_ORIGINS } from "@/common/security/cors-origin";

export class UpdateTenantAllowedOriginsDto {
  @ApiProperty({
    type: [String],
    example: ["https://app.acme.com", "http://localhost:3000"],
    description:
      "Complete replacement list. Each entry is scheme + host + optional port: https required (http only for localhost), no wildcards, paths or trailing slash.",
  })
  @IsArray()
  @ArrayMaxSize(MAX_TENANT_ALLOWED_ORIGINS)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  origins!: string[];
}

export interface TenantAllowedOriginsResponse {
  origins: string[];
}
