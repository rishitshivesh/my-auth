import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, MaxLength } from "class-validator";

export class AddTeamMemberDto {
  @ApiProperty({ example: "teammate@scrolloop.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
