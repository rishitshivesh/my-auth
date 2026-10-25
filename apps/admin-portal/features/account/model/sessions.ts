import type { ActiveSession } from "@scrolloop/sdk";

export interface SessionRow {
  id: string;
  isCurrent: boolean;
  browser?: string;
  os?: string;
  device?: string;
  location?: string;
  lastActivity: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NOW_WINDOW_MS = MINUTE_MS;

export function toSessionRow(session: ActiveSession): SessionRow {
  const city = session.location?.city;
  const country = session.location?.country;
  const location = [city, country].filter(Boolean).join(", ");
  return {
    id: session.id,
    isCurrent: session.isCurrent,
    browser: session.deviceInfo?.browser,
    os: session.deviceInfo?.os,
    device: session.deviceInfo?.device,
    location: location || undefined,
    lastActivity: session.lastActivity,
  };
}

/** This device first, then most recently active. */
export function sortSessions(rows: readonly SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return Date.parse(b.lastActivity) - Date.parse(a.lastActivity);
  });
}

export type Elapsed = { kind: "now" } | { kind: "unknown" } | { kind: "relative"; value: number; unit: "minute" | "hour" | "day" };

export function elapsedSince(iso: string, now: number): Elapsed {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return { kind: "unknown" };
  const diff = Math.max(0, now - time);
  if (diff < NOW_WINDOW_MS) return { kind: "now" };
  if (diff < HOUR_MS) return { kind: "relative", value: -Math.floor(diff / MINUTE_MS), unit: "minute" };
  if (diff < DAY_MS) return { kind: "relative", value: -Math.floor(diff / HOUR_MS), unit: "hour" };
  return { kind: "relative", value: -Math.floor(diff / DAY_MS), unit: "day" };
}

export function formatRelative(elapsed: Elapsed, nowLabel: string, unknownLabel: string, locale = "en"): string {
  if (elapsed.kind === "now") return nowLabel;
  if (elapsed.kind === "unknown") return unknownLabel;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(elapsed.value, elapsed.unit);
}

/** Absolute date for items older than a relative window or when relative makes no sense. */
export function formatDate(iso: string | undefined, fallback: string, locale = "en"): string {
  if (!iso) return fallback;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return fallback;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(time));
}
