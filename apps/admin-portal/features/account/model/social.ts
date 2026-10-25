import type { SocialConnection } from "@scrolloop/sdk";
import type { CopyKey } from "@/i18n";

export const SOCIAL_PROVIDERS = ["google", "github", "microsoft"] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number];

export function providerLabelKey(provider: SocialProviderId): CopyKey {
  return `account.social.providers.${provider}`;
}

export function isKnownProvider(value: string): value is SocialProviderId {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

export interface ProviderRow {
  provider: SocialProviderId;
  connection?: SocialConnection;
}

/** One row per supported provider, in a stable order, with its connection if any. */
export function providerRows(connections: readonly SocialConnection[]): ProviderRow[] {
  return SOCIAL_PROVIDERS.map((provider) => ({
    provider,
    connection: connections.find((c) => c.provider.toLowerCase() === provider),
  }));
}

export type LinkResult = "linked" | "cancelled" | "expired" | "failed";
const LINK_RESULTS: ReadonlySet<string> = new Set(["linked", "cancelled", "expired", "failed"]);

/**
 * Result of the provider round trip, read from `?link=`.
 * TODO(gap:Social login completion claims): the backend does not yet redirect back with a
 * documented result parameter; this reads `link=<result>` once it does and ignores anything else.
 */
export function parseLinkResult(value: string | null): LinkResult | null {
  return value !== null && LINK_RESULTS.has(value) ? (value as LinkResult) : null;
}
