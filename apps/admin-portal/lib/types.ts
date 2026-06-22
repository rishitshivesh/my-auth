// Canonical MFA status shape — matches MfaService.getMfaStatus() exactly
export interface MfaStatus {
  enabled: boolean;
  methods: string[];
  preferredMethod?: string;
  backupCodesRemaining: number;
  grace: {
    startedAt: string | null;
    expiresAt: string | null;
    daysRemaining: number;
    isExpired: boolean;
  };
}

export interface DashboardUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  primaryAuthMethod: string;
  status: string;
  mfaEnabled: boolean;
}


export interface DashboardStats {
  activeSessions: number;
  lastLoginAt?: string;
}

export interface DashboardData {
  user: DashboardUser;
  mfa: MfaStatus;
  stats: DashboardStats;
}

export interface TotpSetupData {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface SocialProviderConfig {
  provider: string;
  enabled: boolean;
  clientId: string | null;
  hasSecret: boolean;
}

export interface TenantSettings {
  featureFlags: Record<string, boolean>;
  socialProviders: SocialProviderConfig[];
}

export interface PasskeyCredential {
  id: string;
  deviceName?: string;
  createdAt: string;
  lastUsedAt?: string;
  transports: string[];
}

export interface SocialConnection {
  id: string;
  provider: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  primary: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface TenantMetrics {
  totalUsers: number;
  activeSessions: number;
  totalApplications: number;
  mfaAdoptionRate: number;
  activeApiKeys: number;
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  actorEmail?: string;
  ipAddress: string;
  location?: string;
  createdAt: string;
  severity: "info" | "warning" | "critical";
  resourceType?: string;
  resourceId?: string;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface AuthBreakdown {
  emailPassword: number;
  google: number;
  github: number;
  microsoft: number;
  apple: number;
  passkey: number;
}

export interface ActiveSessionDto {
  id: string;
  deviceInfo: {
    browser?: string;
    os?: string;
    device?: string;
    type?: string;
  };
  location?: {
    city?: string;
    country?: string;
    timezone?: string;
  };
  ipAddress?: string;
  lastActivity: string;
  createdAt: string;
  isCurrent: boolean;
  tokenFamily: {
    familyId: string;
    tokensInFamily: number;
    lastUsed: string;
  };
}

export type HeaderWeight = "regular" | "bold";
export type BackgroundStyle = "solid" | "gradient";

export const FONT_FAMILY_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Poppins",
  "Montserrat",
  "Nunito",
  "Source Sans Pro",
  "Raleway",
  "Ubuntu",
  "system-ui",
] as const;

export type FontFamily = (typeof FONT_FAMILY_OPTIONS)[number];

export interface BrandingConfig {
  primaryColor: string;
  logoUrl?: string;
  fontFamily: string;
  headerWeight: HeaderWeight;
  backgroundStyle: BackgroundStyle;
}

export interface UserListItem {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  emailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserListResponse {
  users: UserListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface RolePermissionSummary {
  id: string;
  name: string;
  description?: string;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  displayName?: string;
  description?: string;
  scope: string;
  isSystem: boolean;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  rolePermissions?: { permission: RolePermissionSummary }[];
}

export interface Client {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  clientType: string;
  grantTypes: string[];
  redirectUris: string[];
  logoUrl?: string;
  isActive: boolean;
  createdAt: string;
}

// ── Sprint 4 types ────────────────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failedCount: number;
  lastDeliveryAt?: string;
  description?: string;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  status: "pending" | "success" | "failed" | "retrying";
  attempts: number;
  responseStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  durationMs?: number;
  createdAt: string;
}

export interface SamlServiceProvider {
  id: string;
  name: string;
  entityId: string;
  acsUrl: string;
  sloUrl?: string;
  nameIdFormat: string;
  attributeMapping: Record<string, string>;
  active: boolean;
  signAssertions: boolean;
  createdAt: string;
}

export interface ScimToken {
  id: string;
  name: string;
  active: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface LdapConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  bindDn: string;
  baseDn: string;
  userFilter: string;
  groupFilter?: string;
  emailAttribute: string;
  displayNameAttribute?: string;
  firstNameAttribute?: string;
  lastNameAttribute?: string;
  syncSchedule: string;
  active: boolean;
  useTls: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncUsersCreated?: number;
  lastSyncUsersUpdated?: number;
  createdAt: string;
}

// ── RBAC: Permissions & Policies ────────────────────────────────────────────

export interface Permission {
  id: string;
  tenantId: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
  scope: string;
  isSystem: boolean;
}

export interface PolicyStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, unknown>;
}

export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatement[];
}

export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  document: PolicyDocument;
  isSystem: boolean;
  type: 'inline' | 'managed';
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  role: Role;
  assignedAt: string;
  expiresAt?: string;
  reason?: string;
  isGuest: boolean;
}

export interface SimulateResult {
  allowed: boolean;
  reason: 'explicit_allow' | 'explicit_deny' | 'implicit_deny';
  matchedPolicy?: string;
}
