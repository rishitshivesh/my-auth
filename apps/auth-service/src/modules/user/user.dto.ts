import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Update User DTO
 */
export class UpdateUserDto {
  @ApiProperty({ example: "John", required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: "Doe", required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: "John Doe", required: false })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiProperty({ example: "+1234567890", required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: "https://example.com/avatar.jpg", required: false })
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiProperty({ example: "America/New_York", required: false })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({ example: "en", required: false })
  @IsString()
  @IsOptional()
  language?: string;
}

/**
 * Change Password DTO
 */
export class ChangePasswordDto {
  @ApiProperty({ example: "CurrentP@ssw0rd123!" })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: "NewSecureP@ssw0rd123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      "Password must contain uppercase, lowercase, number and special character",
  })
  newPassword!: string;
}
