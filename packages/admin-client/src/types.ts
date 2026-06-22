export type { User, Session } from '@scrolloop/types';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}

export interface UserFilters {
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditFilters {
  userId?: string;
  cursor?: string;
  limit?: number;
  startDate?: string;
  endDate?: string;
  eventType?: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  tenantId: string;
  isSystem: boolean;
  permissions?: Permission[];
  createdAt: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
  tenantId: string;
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  document: PolicyDocument;
  tenantId: string;
  createdAt: string;
}

export interface PolicyDocument {
  Statement: PolicyStatement[];
}

export interface PolicyStatement {
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, unknown>;
}

export interface Group {
  id: string;
  name: string;
  tenantId: string;
  parentGroupId?: string;
  memberCount?: number;
  createdAt: string;
}

export interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  clientType: 'confidential' | 'public';
  grantTypes: string[];
  redirectUris: string[];
  logoutUris?: string[];
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  isActive: boolean;
  isFirstParty: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorEmail?: string;
  actorId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers30d: number;
  activeSessions: number;
  apiCalls30d: number;
  mfaAdoptionPercent: number;
  userGrowthPercent: number;
}

export interface LoginActivityPoint {
  date: string;
  count: number;
}

export type LoginActivityData = LoginActivityPoint[];

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  environment: string;
  active: boolean;
  allowedOrigins?: string[];
  featureFlags?: Record<string, boolean>;
  settings?: {
    allowSignup?: boolean;
    requireEmailVerification?: boolean;
    sessionTimeout?: number;
    mfaRequired?: boolean;
  };
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    companyName?: string;
  };
  createdAt: string;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
  maxAge?: number;
  preventReuse?: number;
}

export interface SimulationRequest {
  userId?: string;
  principal?: { userId?: string; roleIds?: string[] };
  action: string;
  resource: string;
  context?: Record<string, unknown>;
}

export interface TraceEntry {
  policyId: string;
  policyName: string;
  statementSid?: string;
  effect: 'Allow' | 'Deny';
  matched: boolean;
  reason: string;
}

export interface SimulationResult {
  allowed: boolean;
  decision: 'Allow' | 'Deny';
  reason: string;
  trace: TraceEntry[];
  matchedPolicies: string[];
  policiesEvaluated: number;
}

export interface RoleWithPolicies extends Role {
  policies: Policy[];
}

export interface MfaFactor {
  id: string;
  type: 'totp' | 'webauthn' | 'email';
  name?: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface TenantBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  slug: string;
}

export interface TenantMfaPolicy {
  id?: string;
  enforceForAllUsers: boolean;
  enforceForAdmins: boolean;
  gracePeriodDays: number;
  exemptRoleSlugs: string[];
}

export interface CreateRoleDto {
  name: string;
  description?: string;
  cloneFromRoleId?: string;
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
}

export interface CreatePolicyDto {
  name: string;
  description?: string;
  document: PolicyDocument;
}

export interface UpdatePolicyDto {
  name?: string;
  description?: string;
  document?: PolicyDocument;
}

export interface CreateGroupDto {
  name: string;
  parentGroupId?: string;
}

export interface CreateClientDto {
  name: string;
  clientType: OAuthClient['clientType'];
  grantTypes?: string[];
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  allowedWebOrigins?: string[];
  accessTokenLifetime?: number;
  refreshTokenLifetime?: number;
  isFirstParty?: boolean;
}

export interface UpdateClientDto {
  name?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  allowedWebOrigins?: string[];
  accessTokenLifetime?: number;
  refreshTokenLifetime?: number;
}

export interface WorkspaceMembership {
  tenantId: string;
  tenantSlug: string;
  roleSlug: string;
  joinedAt: string;
  status: 'active' | 'suspended' | 'revoked';
}
