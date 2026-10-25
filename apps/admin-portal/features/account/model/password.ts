import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/constants/limits";

export interface PasswordDraft {
  current: string;
  next: string;
  confirm: string;
}

export type PasswordErrorKind = "currentRequired" | "tooShort" | "tooLong" | "sameAsCurrent" | "mismatch";
export type PasswordErrors = Partial<Record<keyof PasswordDraft, PasswordErrorKind>>;

export const EMPTY_PASSWORD_DRAFT: PasswordDraft = { current: "", next: "", confirm: "" };

/** Client-side checks only; the server owns the real policy and its errors are shown as-is. */
export function validatePasswordChange(draft: PasswordDraft): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!draft.current) errors.current = "currentRequired";
  if (draft.next.length < PASSWORD_MIN_LENGTH) errors.next = "tooShort";
  else if (draft.next.length > PASSWORD_MAX_LENGTH) errors.next = "tooLong";
  else if (draft.current && draft.next === draft.current) errors.next = "sameAsCurrent";
  if (draft.confirm !== draft.next) errors.confirm = "mismatch";
  return errors;
}

export function isPasswordDraftReady(draft: PasswordDraft): boolean {
  return Object.keys(validatePasswordChange(draft)).length === 0;
}
