/** Feature flags the tenant settings page may edit; anything else the server returns is shown read-only. */
export const EDITABLE_FLAGS = ["passwordlessEnabled", "socialProvidersEnabled", "mfaRequired"] as const;
export type EditableFlag = (typeof EDITABLE_FLAGS)[number];

export interface SocialProviderStatus {
  provider: string;
  enabled: boolean;
  clientId: string | null;
  hasClientSecret: boolean;
}

export interface TenantSettings {
  featureFlags: Record<string, boolean>;
  socialProviders: SocialProviderStatus[];
}

/** GET /tenants/current returns the tenant entity; only these fields are read. */
export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  environment?: string;
  customDomain?: string | null;
  customDomainVerified?: boolean;
  active?: boolean;
}

export type FlagDraft = Record<EditableFlag, boolean>;

export function flagDraft(flags: Record<string, boolean>): FlagDraft {
  return { passwordlessEnabled: !!flags.passwordlessEnabled, socialProvidersEnabled: !!flags.socialProvidersEnabled, mfaRequired: !!flags.mfaRequired };
}

export function changedFlags(saved: FlagDraft, draft: FlagDraft): Partial<FlagDraft> {
  const out: Partial<FlagDraft> = {};
  for (const flag of EDITABLE_FLAGS) {
    if (saved[flag] !== draft[flag]) out[flag] = draft[flag];
  }
  return out;
}

/** Flags the server holds that this page does not edit. */
export function readOnlyFlags(flags: Record<string, boolean>): string[] {
  return Object.keys(flags).filter((key) => !(EDITABLE_FLAGS as readonly string[]).includes(key)).sort();
}

export type DomainState = "none" | "pending" | "verified";

export function domainState(tenant: Pick<TenantContext, "customDomain" | "customDomainVerified">): DomainState {
  if (!tenant.customDomain) return "none";
  return tenant.customDomainVerified ? "verified" : "pending";
}
