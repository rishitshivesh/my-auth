export const SETUP_PASSWORD_MIN = 12;
export const SETUP_PASSWORD_MAX = 128;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SetupDraft {
  setupToken: string;
  platformName: string;
  name: string;
  email: string;
  password: string;
  confirm: string;
}

export type SetupField = "setupToken" | "name" | "email" | "password" | "confirm";
export type SetupError = "required" | "email" | "minLength" | "maxLength" | "mismatch";
export type SetupErrors = Partial<Record<SetupField, SetupError>>;

export function validateSetup(draft: SetupDraft): SetupErrors {
  const errors: SetupErrors = {};
  if (!draft.setupToken.trim()) errors.setupToken = "required";
  if (!draft.name.trim()) errors.name = "required";
  if (!draft.email.trim()) errors.email = "required";
  else if (!EMAIL.test(draft.email.trim())) errors.email = "email";
  if (!draft.password) errors.password = "required";
  else if (draft.password.length < SETUP_PASSWORD_MIN) errors.password = "minLength";
  else if (draft.password.length > SETUP_PASSWORD_MAX) errors.password = "maxLength";
  if (draft.confirm !== draft.password) errors.confirm = "mismatch";
  return errors;
}

export type SetupOutcome = "initialized" | "invalidToken" | "rateLimited" | "unavailable" | "error";

/** Branch the create-first-admin failure: 409 already initialised, 403 bad token, 429 limited. */
export function classifySetupError(error: unknown): SetupOutcome {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : NaN;
  if (Number.isNaN(status)) return "unavailable";
  if (status === 409) return "initialized";
  if (status === 403) return "invalidToken";
  if (status === 429) return "rateLimited";
  if (status >= 500) return "unavailable";
  return "error";
}
