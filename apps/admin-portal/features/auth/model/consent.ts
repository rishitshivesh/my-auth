import type { CopyKey } from "@/i18n";

const SCOPE_COPY: Readonly<Record<string, CopyKey>> = {
  openid: "auth.consent.scopes.openid",
  profile: "auth.consent.scopes.profile",
  email: "auth.consent.scopes.email",
  offline_access: "auth.consent.scopes.offlineAccess",
};

export interface ScopeView {
  scope: string;
  /** Copy key for known scopes; unknown scopes render their raw identifier. */
  copyKey: CopyKey | null;
}

export function describeScopes(scopes: readonly string[]): ScopeView[] {
  return scopes.map((scope) => ({ scope, copyKey: SCOPE_COPY[scope] ?? null }));
}

/** Only http(s) links from client metadata are rendered as links. */
export function safeExternalUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type ConsentLoadIssue = "sign-in-required" | "expired" | "invalid" | "error";

/** Maps a failed consent-details load to a state. 401 means no session; 400/404 an unknown or expired transaction. */
export function consentLoadIssue(error: unknown): ConsentLoadIssue {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : 0;
  if (status === 401) return "sign-in-required";
  if (status === 400 || status === 404 || status === 410) return "expired";
  if (status === 403 || status === 422) return "invalid";
  return "error";
}
