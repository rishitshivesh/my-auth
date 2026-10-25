import { createHash } from "crypto";

/**
 * Single-use bearer tokens (invite, email verification) are stored only as the
 * SHA-256 of a 256-bit random value. The raw token exists in the emailed link
 * and nowhere else, so a database read cannot be replayed. Lookups are by hash
 * (exact match on a high-entropy digest), so no secret comparison happens in
 * application code.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
