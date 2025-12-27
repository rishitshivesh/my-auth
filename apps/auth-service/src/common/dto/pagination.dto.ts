import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @ApiProperty({ default: 1, description: 'Page number' })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @ApiProperty({ default: 10, description: 'Number of items per page' })
  limit?: number = 10;

  @IsOptional()
  @ApiProperty({ description: 'Search query' })
  q?: string;
}
