import { ApiProperty } from "@nestjs/swagger";
import { IsJWT } from "class-validator";

export class ClaimSessionDto {
  @ApiProperty({ description: "Social-login completion token (JWT)" })
  @IsJWT()
  ct!: string;
}
