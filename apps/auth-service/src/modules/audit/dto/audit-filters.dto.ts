import { IsOptional, IsString, IsInt, Min, Max, IsISO8601, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AuditFiltersDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
