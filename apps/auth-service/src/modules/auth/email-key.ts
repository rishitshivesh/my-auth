import { createHash } from "crypto";

/**
 * Folds an email as far as the database's case-insensitive match does, so two
 * spellings of one account share one rate-limit bucket: NFKC, then
 * lower -> upper -> lower, which also merges spellings a single toLowerCase()
 * keeps apart (final sigma, dotted capital I, the Kelvin sign).
 */
export function foldEmail(email: string): string {
  return email.trim().normalize("NFKC").toLowerCase().toUpperCase().toLowerCase();
}

/** Hashed so the limiter never holds an address that could be read back out. */
export function emailBucketKey(scope: string, email: string): string {
  return `${scope}:email:${createHash("sha256").update(foldEmail(email)).digest("hex")}`;
}
