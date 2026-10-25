import type { CopyKey } from "@/i18n";

/** A validator returns the copy key of its error (and params) or null when valid. */
export interface ValidationIssue {
  key: CopyKey;
  params?: Record<string, string | number>;
}
export type Validator = (value: string) => ValidationIssue | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const required: Validator = (v) =>
  v.trim().length === 0 ? { key: "common.validation.required" } : null;

export const email: Validator = (v) =>
  v.length > 0 && !EMAIL.test(v.trim()) ? { key: "common.validation.email" } : null;

export const slug: Validator = (v) =>
  v.length > 0 && !SLUG.test(v) ? { key: "common.validation.slug" } : null;

export const minLength =
  (min: number): Validator =>
  (v) => (v.length > 0 && v.length < min ? { key: "common.validation.minLength", params: { min } } : null);

export const maxLength =
  (max: number): Validator =>
  (v) => (v.length > max ? { key: "common.validation.maxLength", params: { max } } : null);

/** First failing validator wins, so users see one actionable message at a time. */
export function validate(value: string, validators: readonly Validator[]): ValidationIssue | null {
  for (const validator of validators) {
    const issue = validator(value);
    if (issue) return issue;
  }
  return null;
}
