export const MAX_INVITES_PER_BATCH = 20;
export const DEFAULT_INVITE_DAYS = 7;
export const INVITE_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;
const DAY_MS = 86_400_000;
const EXPIRING_SOON_DAYS = 1;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ParsedEmails {
  valid: readonly string[];
  invalid: readonly string[];
  duplicates: number;
  overLimit: boolean;
}

/** Splits pasted text on commas, semicolons, whitespace; lower-cases and de-duplicates. */
export function parseEmails(text: string, limit: number = MAX_INVITES_PER_BATCH): ParsedEmails {
  const tokens = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const token of tokens) {
    const email = token.toLowerCase();
    if (!EMAIL.test(email)) {
      invalid.push(token);
    } else if (seen.has(email)) {
      duplicates += 1;
    } else {
      seen.add(email);
      valid.push(email);
    }
  }
  return { valid, invalid, duplicates, overLimit: valid.length > limit };
}

export type InviteExpiry = { state: "active" | "expiringSoon" | "expired"; daysLeft: number };

export function inviteExpiry(expiresAt: string, now: number = Date.now()): InviteExpiry {
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return { state: "expired", daysLeft: 0 };
  const daysLeft = Math.ceil(remaining / DAY_MS);
  return { state: daysLeft <= EXPIRING_SOON_DAYS ? "expiringSoon" : "active", daysLeft };
}

export interface BatchOutcome {
  email: string;
  ok: boolean;
  /** Error code or message when `ok` is false. */
  error?: string;
}

export function summarizeBatch(outcomes: readonly BatchOutcome[]): { sent: number; failed: readonly BatchOutcome[] } {
  return { sent: outcomes.filter((o) => o.ok).length, failed: outcomes.filter((o) => !o.ok) };
}
