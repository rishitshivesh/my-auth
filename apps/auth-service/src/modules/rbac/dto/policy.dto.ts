import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
  IsIn,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PolicyConditionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  IpAddress?: { 'sentry:SourceIp': string | string[] };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  DateGreaterThan?: { 'sentry:CurrentTime': string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  DateLessThan?: { 'sentry:CurrentTime': string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  Bool?: { 'sentry:MultiFactorAuthPresent': boolean };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  StringEquals?: Record<string, string | string[]>;
}

export class PolicyStatementDto {
  @ApiPropertyOptional({ example: 'AllowUserRead' })
  @IsString()
  @IsOptional()
  Sid?: string;

  @ApiProperty({ enum: ['Allow', 'Deny'] })
  @IsIn(['Allow', 'Deny'])
  Effect!: 'Allow' | 'Deny';

  @ApiPropertyOptional()
  @IsOptional()
  Principal?: string | string[] | '*';

  @ApiProperty({ example: ['users:read'] })
  Action!: string | string[];

  @ApiProperty({ example: ['sentry:tenant:*/user:*'] })
  Resource!: string | string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => PolicyConditionDto)
  Condition?: PolicyConditionDto;
}

export class PolicyDocumentDto {
  @ApiProperty({ example: '2024-01-01' })
  @IsString()
  Version!: string;

  @ApiProperty({ type: [PolicyStatementDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PolicyStatementDto)
  Statement!: PolicyStatementDto[];
}

export class CreatePolicyDto {
  @ApiProperty({ example: 'ReadOnlyAccess' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Grants read-only access to all resources' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => PolicyDocumentDto)
  document!: PolicyDocumentDto;

  @ApiPropertyOptional({ enum: ['inline', 'managed'], default: 'managed' })
  @IsIn(['inline', 'managed'])
  @IsOptional()
  type?: 'inline' | 'managed';
}

export class UpdatePolicyDto {
  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @ValidateNested()
  @Type(() => PolicyDocumentDto)
  @IsOptional()
  document?: PolicyDocumentDto;
}

export class SimulatePolicyDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: 'users:read' })
  @IsString()
  action!: string;

  @ApiProperty({ example: 'sentry:tenant:acme/user:123' })
  @IsString()
  resource!: string;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsString()
  @IsOptional()
  ipAddress?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  mfaVerified?: boolean;
}
