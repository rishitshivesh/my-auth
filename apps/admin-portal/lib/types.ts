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
