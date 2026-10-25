/**
 * Client-side hint mirroring the server floor (12..128 characters). The server stays
 * authoritative (common-password / email checks, per-tenant tightening).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordIssue = "too-short" | "too-long" | "contains-email" | null;

export function checkPassword(password: string, email?: string): PasswordIssue {
  if (password.length === 0) return null;
  if (password.length < PASSWORD_MIN_LENGTH) return "too-short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too-long";
  const local = email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "contains-email";
  return null;
}
