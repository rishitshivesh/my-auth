/** Short-lived MFA challenge handed from the sign-in step to /u/mfa. Pure; storage lives in api/. */

export const MFA_CHALLENGE_TTL_MS = 5 * 60_000;

export type ChallengeMethod = "totp" | "backup" | "email" | "webauthn";

export interface StoredChallenge {
  tempToken: string;
  methods: readonly string[];
  preferred?: string;
  remainingAttempts?: number;
  /** Where to continue once the session exists (validated again on use). */
  next?: string;
  /** Destination the auth-service validated for an emailed link; carried through the challenge. */
  redirectUri?: string;
  expiresAt: number;
}

export function createChallenge(
  input: Omit<StoredChallenge, "expiresAt">,
  now: number,
  ttlMs: number = MFA_CHALLENGE_TTL_MS,
): StoredChallenge {
  return { ...input, expiresAt: now + ttlMs };
}

export function isChallengeLive(challenge: StoredChallenge | null, now: number): challenge is StoredChallenge {
  return challenge !== null && challenge.expiresAt > now && challenge.tempToken.length > 0;
}

export function parseChallenge(raw: string | null): StoredChallenge | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const rec = value as Record<string, unknown>;
    if (typeof rec.tempToken !== "string" || typeof rec.expiresAt !== "number") return null;
    return {
      tempToken: rec.tempToken,
      methods: Array.isArray(rec.methods) ? rec.methods.filter((m): m is string => typeof m === "string") : [],
      preferred: typeof rec.preferred === "string" ? rec.preferred : undefined,
      remainingAttempts: typeof rec.remainingAttempts === "number" ? rec.remainingAttempts : undefined,
      next: typeof rec.next === "string" ? rec.next : undefined,
      redirectUri: typeof rec.redirectUri === "string" ? rec.redirectUri : undefined,
      expiresAt: rec.expiresAt,
    };
  } catch {
    return null;
  }
}

export const MFA_METHODS: readonly ChallengeMethod[] = ["totp", "email", "webauthn"];

/**
 * Second factors the challenge offers, in the order we present them. An empty list from older
 * servers means authenticator app only. Recovery codes are always a fallback ("backup").
 */
export function offeredMethods(methods: readonly string[]): ChallengeMethod[] {
  const out = MFA_METHODS.filter((m) => methods.includes(m));
  return out.length > 0 ? [...out] : ["totp"];
}

/** The method to show first: the server's preference when it is one we can complete, else the first offered. */
export function initialMethod(methods: readonly string[], preferred?: string): ChallengeMethod {
  const offered = offeredMethods(methods);
  const match = offered.find((m) => m === preferred);
  return match ?? offered[0] ?? "totp";
}
