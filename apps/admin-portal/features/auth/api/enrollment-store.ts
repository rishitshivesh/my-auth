import { parseEnrollment, type StoredEnrollment } from "../model/enrollment";

const KEY = "sentry:mfa-enrollment";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Tab-scoped and short-lived: the enrollment token never reaches the URL. */
export function saveEnrollment(enrollment: StoredEnrollment): void {
  try {
    store()?.setItem(KEY, JSON.stringify(enrollment));
  } catch {
    // Storage blocked: enrollment can still work from the httpOnly cookie when one was set.
  }
}

export function loadEnrollment(now: number = Date.now()): StoredEnrollment | null {
  const parsed = parseEnrollment(store()?.getItem(KEY) ?? null, now);
  if (!parsed) clearEnrollment();
  return parsed;
}

export function clearEnrollment(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
