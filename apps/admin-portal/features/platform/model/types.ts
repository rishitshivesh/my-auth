export interface PlatformMetrics {
  totalTenants: number;
  totalUsers: number;
  activeSessions: number;
  apiCallsToday: number;
}

export interface ActivityItem {
  id: string;
  eventType: string;
  actorEmail?: string | null;
  severity: string;
  createdAt: string;
  ipAddress?: string | null;
  tenantId?: string | null;
}

export type TenantStatus = "active" | "suspended";

export interface TenantListItem {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: TenantStatus | string;
  userCount: number;
  createdAt: string;
  environment: string;
  customDomain?: string | null;
}

export interface TenantDetail extends TenantListItem {
  featureFlags: Record<string, boolean>;
  activeSessions: number;
  recentActivity: ActivityItem[];
}

export interface TenantsPage {
  tenants: TenantListItem[];
  total: number;
}

export interface TeamMember {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  addedAt?: string | null;
}

export interface PlatformSettings {
  platformName: string;
  smtpConfigured: boolean;
  smtpHost?: string | null;
  supportEmail?: string | null;
  allowPublicSignup: boolean;
  maintenanceMode: boolean;
}

export interface PlatformInfo {
  slug: string;
  name: string;
  initialized: boolean;
}
