import { OTP_LENGTH } from "@/constants/limits";
import { checkPassword, type PasswordIssue } from "./password-policy";

export type ResetStep = "request" | "reset" | "done";

export type ResetIssue = PasswordIssue | "mismatch" | "code-incomplete" | "password-empty";

/** First problem blocking submit, or null. Ordered so users fix one thing at a time. */
export function resetIssue(input: { code: string; password: string; confirm: string; email: string }): ResetIssue {
  if (input.code.length !== OTP_LENGTH) return "code-incomplete";
  if (input.password.length === 0) return "password-empty";
  const policy = checkPassword(input.password, input.email);
  if (policy) return policy;
  if (input.password !== input.confirm) return "mismatch";
  return null;
}
