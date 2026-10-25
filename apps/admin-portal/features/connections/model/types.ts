/** Response shapes of the dashboard social settings, SAML, SCIM and LDAP endpoints. */

export type SocialProviderId = "google" | "github" | "microsoft";

export interface SocialProviderSetting {
  provider: string;
  enabled: boolean;
  clientId: string | null;
  hasClientSecret: boolean;
}

export interface TenantSettingsResponse {
  featureFlags: Record<string, boolean>;
  socialProviders: SocialProviderSetting[];
}

export interface UpdateSocialProviderBody {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
}

export interface SamlServiceProvider {
  id: string;
  name: string;
  entityId: string;
  acsUrl: string;
  sloUrl?: string | null;
  active: boolean;
  signAssertions?: boolean;
  createdAt?: string;
}

export interface RegisterSamlBody {
  name: string;
  entityId: string;
  acsUrl: string;
  sloUrl?: string;
  metadataUrl?: string;
  certificate?: string;
}

export interface ScimTokenRecord {
  id: string;
  name: string;
  active?: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
}

/** POST /scim/tokens: the raw token appears once. */
export interface CreatedScimToken {
  token: string;
  record: ScimTokenRecord;
}

export interface CreateScimTokenBody {
  name: string;
  expiresInDays?: number;
}

export interface LdapConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  bindDn?: string;
  baseDn?: string;
  syncSchedule?: string | null;
  active: boolean;
  useTls?: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncUsersCreated?: number | null;
  lastSyncUsersUpdated?: number | null;
}

export interface CreateLdapBody {
  name: string;
  host: string;
  port: number;
  useTls: boolean;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter?: string;
  groupFilter?: string;
  emailAttribute?: string;
  syncSchedule?: string;
}

export interface LdapTestResult {
  success: boolean;
  message: string;
}
