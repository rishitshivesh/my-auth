import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Engineering' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Engineering department' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'parent-group-uuid' })
  @IsUUID()
  @IsOptional()
  parentGroupId?: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Updated Engineering' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;
}
