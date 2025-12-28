// apps/auth-service/src/modules/rbac/dto/rbac.dto.ts

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsDateString,
} from "class-validator";

// ============================================================
// PERMISSION DTOs
// ============================================================

export class CreatePermissionDto {
  @ApiProperty({ example: "users:write" })
  @IsString()
  name!: string;

  @ApiProperty({ example: "users" })
  @IsString()
  resource!: string;

  @ApiProperty({ example: "write" })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ example: "Create and update users" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: "tenant" })
  @IsString()
  @IsOptional()
  scope?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: "Updated description" })
  @IsString()
  @IsOptional()
  description?: string;
}

// ============================================================
// ROLE DTOs
// ============================================================

export class CreateRoleDto {
  @ApiProperty({ example: "developer" })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: "Developer" })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ example: "Role for developers" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: ["users:read", "clients:*"] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionNames?: string[];

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 500 })
  @IsNumber()
  @IsOptional()
  priority?: number;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: "Senior Developer" })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ example: "Updated description" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 600 })
  @IsNumber()
  @IsOptional()
  priority?: number;
}

export class AssignPermissionsDto {
  @ApiProperty({ example: ["users:read", "users:write"] })
  @IsArray()
  @IsString({ each: true })
  permissionNames!: string[];
}

export class RemovePermissionsDto {
  @ApiProperty({ example: ["users:delete"] })
  @IsArray()
  @IsString({ each: true })
  permissionNames!: string[];
}

// ============================================================
// USER-ROLE DTOs
// ============================================================

export class AssignRoleDto {
  @ApiProperty({ example: "role-uuid" })
  @IsString()
  roleId!: string;

  @ApiPropertyOptional({ example: "2025-12-31T23:59:59Z" })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ example: "Temporary admin access" })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class AssignRolesByNameDto {
  @ApiProperty({ example: ["developer", "user"] })
  @IsArray()
  @IsString({ each: true })
  roleNames!: string[];

  @ApiPropertyOptional({ example: "2025-12-31T23:59:59Z" })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ example: "Granted access for project" })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class SetUserRolesDto {
  @ApiProperty({ example: ["admin", "developer"] })
  @IsArray()
  @IsString({ each: true })
  roleNames!: string[];
}

// ============================================================
// RESPONSE DTOs
// ============================================================

export class PermissionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  resource!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  scope!: string;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class RoleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayName?: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  priority!: number;

  @ApiProperty({ type: [PermissionResponseDto] })
  permissions?: PermissionResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class UserRoleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  roleId!: string;

  @ApiProperty({ type: RoleResponseDto })
  role!: RoleResponseDto;

  @ApiProperty()
  assignedBy?: string;

  @ApiProperty()
  assignedAt!: Date;

  @ApiProperty()
  expiresAt?: Date;

  @ApiProperty()
  reason?: string;

  @ApiProperty()
  isExpired!: boolean;
}

export class CheckPermissionDto {
  @ApiProperty({ example: "users:write" })
  @IsString()
  permission!: string;
}

export class CheckPermissionsDto {
  @ApiProperty({ example: ["users:write", "users:delete"] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class CheckRoleDto {
  @ApiProperty({ example: "admin" })
  @IsString()
  role!: string;
}

export class CheckRolesDto {
  @ApiProperty({ example: ["admin", "developer"] })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}
