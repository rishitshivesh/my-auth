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
