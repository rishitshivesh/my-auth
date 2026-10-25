import type { SocialProviderId, SocialProviderSetting, UpdateSocialProviderBody } from "./types";

export const SOCIAL_PROVIDER_IDS: readonly SocialProviderId[] = ["google", "github", "microsoft"];

export interface SocialRow {
  provider: SocialProviderId;
  enabled: boolean;
  clientId: string;
  hasClientSecret: boolean;
  configured: boolean;
}

/** Every supported provider appears, configured or not; unknown server rows are ignored. */
export function socialRows(settings: readonly SocialProviderSetting[]): SocialRow[] {
  return SOCIAL_PROVIDER_IDS.map((provider) => {
    const found = settings.find((s) => s.provider === provider);
    const clientId = found?.clientId ?? "";
    const hasClientSecret = found?.hasClientSecret ?? false;
    return {
      provider,
      enabled: found?.enabled ?? false,
      clientId,
      hasClientSecret,
      configured: clientId !== "" && hasClientSecret,
    };
  });
}

export interface SocialDraft {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

export type SocialError = "clientId" | "clientSecret";

export function toSocialDraft(row: SocialRow): SocialDraft {
  return { enabled: row.enabled, clientId: row.clientId, clientSecret: "" };
}

/** Enabling needs credentials; the stored secret counts, a blank field keeps it. */
export function validateSocialDraft(draft: SocialDraft, row: SocialRow): SocialError[] {
  const errors: SocialError[] = [];
  if (draft.enabled || draft.clientId.trim() !== "" || draft.clientSecret !== "") {
    if (draft.clientId.trim() === "") errors.push("clientId");
    if (draft.clientSecret === "" && !row.hasClientSecret) errors.push("clientSecret");
  }
  return errors;
}

/** The secret is sent only when typed; omission leaves the stored one unchanged. */
export function toSocialBody(draft: SocialDraft): UpdateSocialProviderBody {
  return {
    enabled: draft.enabled,
    ...(draft.clientId.trim() !== "" ? { clientId: draft.clientId.trim() } : {}),
    ...(draft.clientSecret !== "" ? { clientSecret: draft.clientSecret } : {}),
  };
}
