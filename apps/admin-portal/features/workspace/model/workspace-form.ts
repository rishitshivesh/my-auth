export const SLUG_MIN = 4;
export const SLUG_MAX = 63;
export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Suggests a slug from the workspace name until the person edits it. */
export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, SLUG_MAX);
}

export type SlugIssue = "required" | "tooShort" | "tooLong" | "format";

export function validateSlug(slug: string): SlugIssue | undefined {
  if (!slug) return "required";
  if (slug.length < SLUG_MIN) return "tooShort";
  if (slug.length > SLUG_MAX) return "tooLong";
  if (!SLUG_PATTERN.test(slug)) return "format";
  return undefined;
}

export type SlugCheckState = "idle" | "invalid" | "checking" | "available" | "taken" | "unknown";

export interface WorkspaceDetails { name: string; slug: string }
export interface OwnerDetails { name: string; email: string; password: string }

export type DetailsErrors = Partial<Record<"name" | "slug", "required" | SlugIssue | "tooLong">>;
export type OwnerErrors = Partial<Record<"name" | "email" | "password", "required" | "email" | "passwordShort" | "passwordLong">>;

export function validateDetails(d: WorkspaceDetails): DetailsErrors {
  const errors: DetailsErrors = {};
  if (!d.name.trim()) errors.name = "required";
  else if (d.name.trim().length > NAME_MAX) errors.name = "tooLong";
  const slug = validateSlug(d.slug);
  if (slug) errors.slug = slug;
  return errors;
}

export function validateOwner(o: OwnerDetails): OwnerErrors {
  const errors: OwnerErrors = {};
  if (!o.name.trim()) errors.name = "required";
  if (!o.email.trim()) errors.email = "required";
  else if (!EMAIL.test(o.email.trim())) errors.email = "email";
  if (!o.password) errors.password = "required";
  else if (o.password.length < PASSWORD_MIN) errors.password = "passwordShort";
  else if (o.password.length > PASSWORD_MAX) errors.password = "passwordLong";
  return errors;
}

export interface RegisterBody {
  workspaceName: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export function buildRegisterBody(d: WorkspaceDetails, o: OwnerDetails): RegisterBody {
  return {
    workspaceName: d.name.trim(),
    slug: d.slug.trim(),
    adminName: o.name.trim(),
    adminEmail: o.email.trim().toLowerCase(),
    adminPassword: o.password,
  };
}

/** Whether the "continue" button may proceed: only a confirmed-available slug. */
export function canContinueDetails(errors: DetailsErrors, slugState: SlugCheckState): boolean {
  return Object.keys(errors).length === 0 && slugState === "available";
}
