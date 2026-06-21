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
  name: string;
  clientId: string;
  type: 'spa' | 'm2m' | 'web';
  redirectUris: string[];
  tenantId: string;
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
  activeSessions: number;
  apiCalls30d: number;
  mfaAdoptionPercent: number;
  userGrowthPercent?: number;
}

export interface LoginActivityPoint {
  date: string;
  count: number;
}

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
  principal: { userId?: string; roleIds?: string[] };
  action: string;
  resource: string;
  context?: Record<string, unknown>;
}

export interface SimulationResult {
  decision: 'Allow' | 'Deny';
  reason: string;
  matchedPolicies: string[];
}
