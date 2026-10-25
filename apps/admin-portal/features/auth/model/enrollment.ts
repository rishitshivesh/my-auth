/** Pre-session MFA enrollment handoff. Pure; storage lives in api/enrollment-store.ts. */

export const ENROLLMENT_TTL_MS = 5 * 60_000;

export interface StoredEnrollment {
  /** Present for password sign-in; magic-link and passkey sign-in deliver it by cookie only. */
  enrollmentToken?: string;
  next?: string;
  redirectUri?: string;
  expiresAt: number;
}

export function createEnrollment(input: Omit<StoredEnrollment, "expiresAt">, now: number): StoredEnrollment {
  return { ...input, expiresAt: now + ENROLLMENT_TTL_MS };
}

export function parseEnrollment(raw: string | null, now: number): StoredEnrollment | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const rec = value as Record<string, unknown>;
    if (typeof rec.expiresAt !== "number" || rec.expiresAt <= now) return null;
    const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    return {
      enrollmentToken: str(rec.enrollmentToken),
      next: str(rec.next),
      redirectUri: str(rec.redirectUri),
      expiresAt: rec.expiresAt,
    };
  } catch {
    return null;
  }
}
