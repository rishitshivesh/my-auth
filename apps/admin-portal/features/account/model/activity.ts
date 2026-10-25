import type { SecurityEvent } from "@scrolloop/sdk";
import type { CopyKey } from "@/i18n";

const EVENT_KEYS: Readonly<Record<string, CopyKey>> = {
  LOGIN_SUCCESS: "account.activity.events.login",
  LOGIN_FAILURE: "account.activity.events.loginFailed",
  LOGOUT: "account.activity.events.logout",
  PASSWORD_CHANGED: "account.activity.events.passwordChanged",
  PASSWORD_RESET_COMPLETED: "account.activity.events.passwordReset",
  MFA_ENABLED: "account.activity.events.mfaEnabled",
  MFA_DISABLED: "account.activity.events.mfaDisabled",
  ACCOUNT_LOCKED: "account.activity.events.accountLocked",
  SESSION_REVOKED: "account.activity.events.sessionRevoked",
};

export function eventLabelKey(eventType: string): CopyKey {
  return EVENT_KEYS[eventType.toUpperCase()] ?? "account.activity.events.unknown";
}

export type SeverityKey = "info" | "low" | "medium" | "high" | "critical" | "unknown";
export type SeverityTone = "neutral" | "warning" | "danger";

const SEVERITIES: ReadonlySet<string> = new Set(["info", "low", "medium", "high", "critical"]);

export function severityKey(severity: string): SeverityKey {
  const value = severity.toLowerCase();
  return SEVERITIES.has(value) ? (value as SeverityKey) : "unknown";
}

export function severityTone(key: SeverityKey): SeverityTone {
  if (key === "high" || key === "critical") return "danger";
  if (key === "medium") return "warning";
  return "neutral";
}

/** Human location from the server's free-form location object; undefined when nothing usable. */
export function eventPlace(event: Pick<SecurityEvent, "location" | "ipAddress">): string | undefined {
  const loc = event.location;
  const parts: string[] = [];
  for (const key of ["city", "country"] as const) {
    const value = loc?.[key];
    if (typeof value === "string" && value) parts.push(value);
  }
  const place = parts.join(", ");
  if (place && event.ipAddress) return `${place} (${event.ipAddress})`;
  return place || event.ipAddress || undefined;
}

export function sortEvents(events: readonly SecurityEvent[]): SecurityEvent[] {
  return [...events].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
