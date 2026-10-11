import { ApiProperty } from "@nestjs/swagger";
import { IsObject } from "class-validator";

export class UpdateTenantSettingsDto {
  @ApiProperty({
    description: "Map of feature flag name to enabled state",
    type: "object",
    additionalProperties: { type: "boolean" },
  })
  @IsObject()
  featureFlags!: Record<string, boolean>;
}
