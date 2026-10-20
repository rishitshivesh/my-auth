import { ApiException } from "@/common/http";
import { COMMON_PASSWORDS } from "./constants/common-passwords";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
// Shortest email local part worth matching; avoids rejecting on "a" or "ab".
const MIN_EMAIL_PART_LENGTH = 4;
// "aaaaaaaaaaaa" or "abababababab": at most this many distinct characters.
const MAX_REPETITIVE_DISTINCT_CHARS = 2;

export type PasswordViolation =
  | "too_short"
  | "too_long"
  | "too_common"
  | "too_repetitive"
  | "contains_email";

export const PASSWORD_VIOLATION_MESSAGES: Readonly<Record<PasswordViolation, string>> = {
  too_short: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  too_common: "Password is too common. Choose something less guessable.",
  too_repetitive: "Password is too repetitive.",
  contains_email: "Password must not contain your email address.",
};

/**
 * Compatibility-fold (NFKC) so visually identical input hashes identically.
 * Applied before hashing and before policy checks.
 */
export function normalizePassword(password: string): string {
  return password.normalize("NFKC");
}

export interface PasswordPolicyContext {
  email?: string;
}

/**
 * Length, a deny list and two cheap guards against trivially guessable
 * choices. No forced symbols and no periodic rotation.
 */
export function checkPasswordPolicy(
  password: string,
  deny: ReadonlySet<string>,
  context: PasswordPolicyContext = {},
): PasswordViolation | null {
  const normalized = normalizePassword(password);
  const characters = Array.from(normalized);

  if (characters.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (characters.length > PASSWORD_MAX_LENGTH) return "too_long";

  const lowered = normalized.toLowerCase();
  if (deny.has(lowered)) return "too_common";
  if (new Set(characters).size <= MAX_REPETITIVE_DISTINCT_CHARS) {
    return "too_repetitive";
  }

  if (context.email) {
    const email = context.email.trim().toLowerCase();
    const localPart = email.split("@")[0] ?? "";
    if (lowered.includes(email)) return "contains_email";
    if (localPart.length >= MIN_EMAIL_PART_LENGTH && lowered.includes(localPart)) {
      return "contains_email";
    }
  }
  return null;
}

/**
 * Throws PASSWORD_POLICY with a field error when the password is unacceptable.
 * Use on every path that sets a password: register, reset, change, admin-set,
 * invite accept.
 */
export function assertPasswordPolicy(
  password: string,
  context: PasswordPolicyContext = {},
): void {
  const violation = checkPasswordPolicy(password, COMMON_PASSWORDS, context);
  if (!violation) return;
  throw new ApiException("PASSWORD_POLICY", {
    errors: [{ field: "password", message: PASSWORD_VIOLATION_MESSAGES[violation] }],
  });
}
