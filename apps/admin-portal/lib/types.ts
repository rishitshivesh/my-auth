// Canonical MFA status shape — matches MfaService.getMfaStatus() exactly
export interface MfaStatus {
  enabled: boolean;
  methods: string[];
  preferredMethod?: string;
  backupCodesRemaining: number;
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
