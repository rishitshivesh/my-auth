import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/modules/auth/password-policy";

export class UpdatePasswordPolicyDto {
  @ApiPropertyOptional({ minimum: PASSWORD_MIN_LENGTH, maximum: PASSWORD_MAX_LENGTH })
  @IsOptional()
  @IsInt()
  @Min(PASSWORD_MIN_LENGTH)
  @Max(PASSWORD_MAX_LENGTH)
  minLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireCommonPasswordCheck?: boolean;

  @ApiPropertyOptional({ description: "Previous passwords that cannot be reused (0 disables)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  historyCount?: number;

  @ApiPropertyOptional({ description: "Days before a password expires (0 = never)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  maxAgeDays?: number;

  @ApiPropertyOptional({ description: "Failed sign-ins before the account locks." })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  lockoutThreshold?: number;

  @ApiPropertyOptional({ description: "Minutes an account stays locked." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  lockoutDurationMinutes?: number;
}
