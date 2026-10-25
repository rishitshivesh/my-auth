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
      expiresAt: rec.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Methods the login-time endpoints can really complete today: TOTP and recovery code.
 * TODO(gap:Email-OTP / passkey as login-time second factor): email/webauthn are
 * advertised by `login` but /auth/mfa/verify only checks TOTP.
 */
export function completableMethods(methods: readonly string[]): ChallengeMethod[] {
  const out: ChallengeMethod[] = [];
  if (methods.length === 0 || methods.includes("totp")) out.push("totp");
  out.push("backup");
  return out;
}

export function hasUnsupportedMethods(methods: readonly string[]): boolean {
  return methods.some((m) => m === "email" || m === "webauthn");
}
