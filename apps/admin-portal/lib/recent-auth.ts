import { RECENT_AUTH_INTENT_TTL_MS, RECENT_AUTH_WINDOW_MS } from "@/constants/limits";
import { authRoutes } from "@/constants/routes";

export const RECENT_AUTH_STORAGE_KEY = "sentry:recent-auth-intent";
export const REAUTH_DONE_PARAM = "reauth";

/** True when the last sign-in is inside the recent-auth window. UI hint only. */
export function isRecentlyAuthenticated(authenticatedAt: number | undefined, now: number): boolean {
  return authenticatedAt !== undefined && now - authenticatedAt <= RECENT_AUTH_WINDOW_MS;
}

/**
 * Accept only same-origin absolute paths so a crafted `next` cannot become an
 * open redirect. Anything else falls back to `fallback`.
 */
export function sanitizeReturnPath(path: string | null | undefined, fallback = "/"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if ([...path].some((ch) => ch.charCodeAt(0) < 0x20)) return fallback;
  return path;
}

export interface RecentAuthIntent {
  returnTo: string;
  /** Identifies which pending action to resume (caller-defined). */
  action: string;
  createdAt: number;
}

export function saveIntent(storage: Pick<Storage, "setItem">, intent: RecentAuthIntent): void {
  storage.setItem(RECENT_AUTH_STORAGE_KEY, JSON.stringify(intent));
}

/** Read and clear the stored intent; null when absent, malformed or expired. */
export function consumeIntent(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now: number,
): RecentAuthIntent | null {
  const raw = storage.getItem(RECENT_AUTH_STORAGE_KEY);
  storage.removeItem(RECENT_AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { returnTo, action, createdAt } = parsed as Record<string, unknown>;
    if (typeof returnTo !== "string" || typeof action !== "string" || typeof createdAt !== "number") return null;
    if (now - createdAt > RECENT_AUTH_INTENT_TTL_MS) return null;
    return { returnTo: sanitizeReturnPath(returnTo), action, createdAt };
  } catch {
    return null;
  }
}

/** Login URL that returns to `returnTo` after a fresh sign-in. */
export function reauthUrl(returnTo: string): string {
  return authRoutes.login({ next: sanitizeReturnPath(returnTo), reauth: "1" });
}
