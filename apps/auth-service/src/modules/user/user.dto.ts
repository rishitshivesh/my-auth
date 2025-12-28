import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsBoolean,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

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

// ============================================================
// NEW DTOs FOR LIST USERS
// ============================================================

/**
 * Query parameters for listing users
 */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ example: 1, description: "Page number", minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: "Number of items per page",
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    example: "createdAt",
    description: "Field to sort by",
    enum: [
      "createdAt",
      "updatedAt",
      "email",
      "firstName",
      "lastName",
      "lastLoginAt",
    ],
  })
  @IsString()
  @IsOptional()
  sortBy?: string = "createdAt";

  @ApiPropertyOptional({
    example: "DESC",
    description: "Sort order",
    enum: ["ASC", "DESC"],
  })
  @IsEnum(["ASC", "DESC"])
  @IsOptional()
  sortOrder?: "ASC" | "DESC" = "DESC";

  @ApiPropertyOptional({
    example: "john",
    description:
      "Search term (searches email, first name, last name, display name)",
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    example: true,
    description: "Filter by active status",
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: "Filter by email verification status",
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  emailVerified?: boolean;

  @ApiPropertyOptional({
    example: "admin",
    description: "Filter by role name",
  })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({
    example: "2024-01-01T00:00:00Z",
    description: "Filter users created after this date",
  })
  @IsDateString()
  @IsOptional()
  createdAfter?: string;

  @ApiPropertyOptional({
    example: "2024-12-31T23:59:59Z",
    description: "Filter users created before this date",
  })
  @IsDateString()
  @IsOptional()
  createdBefore?: string;
}

/**
 * Response DTO for user list item
 */
export class UserListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Pagination metadata
 */
export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 150 })
  total!: number;

  @ApiProperty({ example: 8 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

/**
 * Response DTO for paginated users list
 */
export class ListUsersResponseDto {
  @ApiProperty({ type: [UserListItemDto] })
  users!: UserListItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

/**
 * User statistics DTO
 */
export class UserStatsDto {
  @ApiProperty({ example: 150, description: "Total users" })
  total!: number;

  @ApiProperty({ example: 145, description: "Active users" })
  active!: number;

  @ApiProperty({ example: 5, description: "Inactive users" })
  inactive!: number;

  @ApiProperty({ example: 140, description: "Email verified users" })
  verified!: number;

  @ApiProperty({ example: 10, description: "Email unverified users" })
  unverified!: number;

  @ApiProperty({ example: 45, description: "Users logged in last 7 days" })
  recentLogins!: number;
}

/**
 * Bulk update users DTO
 */
export class BulkUpdateUsersDto {
  @ApiProperty({
    example: ["user-id-1", "user-id-2"],
    description: "User IDs to update",
  })
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty({ example: true, description: "Set active status" })
  @IsBoolean()
  isActive!: boolean;
}
