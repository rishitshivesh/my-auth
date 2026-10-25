/** Wire types for the tenant user API (apps/auth-service/src/modules/user). */

export interface UserListItemDto {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  emailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface UserListDto {
  users: UserListItemDto[];
  pagination: PaginationDto;
}

/** GET /users/:id returns the stored user; only the fields the console shows are typed. */
export interface UserDetailDto extends UserListItemDto {
  status?: "active" | "inactive" | "suspended" | "deleted";
  lockedUntil?: string | null;
  phone?: string | null;
  timezone?: string | null;
  mfaSettings?: { isEnabled?: boolean } | null;
}

export interface PendingInviteDto {
  id: string;
  email: string;
  roleIds: string[];
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface UserSessionDto {
  id: string;
  deviceInfo?: { browser?: string; os?: string; device?: string; type?: string };
  location?: { city?: string; country?: string };
  ipAddress?: string;
  lastActivity?: string;
  lastActivityAt?: string;
  createdAt: string;
  isCurrent?: boolean;
}

export interface SecurityEventDto {
  id: string;
  eventType: string;
  severity: string;
  ipAddress?: string;
  location?: string;
  createdAt: string;
}

export interface UpdateUserBody {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
}

export interface InviteBody {
  email: string;
  roleIds?: string[];
  expiresInDays?: number;
}
