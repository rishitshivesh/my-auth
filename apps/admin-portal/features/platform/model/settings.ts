import type { PlatformSettings } from "./types";

export interface PlatformDraft {
  platformName: string;
  supportEmail: string;
  allowPublicSignup: boolean;
  maintenanceMode: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PLATFORM_NAME_MAX = 120;
export const EMAIL_MAX = 320;

export type PlatformDraftErrors = Partial<Record<"platformName" | "supportEmail", "required" | "tooLong" | "email">>;

export function toPlatformDraft(settings: PlatformSettings): PlatformDraft {
  return {
    platformName: settings.platformName,
    supportEmail: settings.supportEmail ?? "",
    allowPublicSignup: settings.allowPublicSignup,
    maintenanceMode: settings.maintenanceMode,
  };
}

export function validatePlatformDraft(draft: PlatformDraft): PlatformDraftErrors {
  const errors: PlatformDraftErrors = {};
  if (!draft.platformName.trim()) errors.platformName = "required";
  else if (draft.platformName.length > PLATFORM_NAME_MAX) errors.platformName = "tooLong";
  const email = draft.supportEmail.trim();
  if (email && !EMAIL.test(email)) errors.supportEmail = "email";
  else if (email.length > EMAIL_MAX) errors.supportEmail = "tooLong";
  return errors;
}

export function isPlatformDirty(saved: PlatformSettings, draft: PlatformDraft): boolean {
  const base = toPlatformDraft(saved);
  return (Object.keys(base) as (keyof PlatformDraft)[]).some((key) => base[key] !== draft[key]);
}

/** Only fields the PATCH DTO supports are sent; an emptied support email is omitted (the DTO cannot clear it). */
export function platformPayload(draft: PlatformDraft): Partial<PlatformDraft> {
  const { supportEmail, ...rest } = draft;
  return supportEmail.trim() ? { ...rest, supportEmail: supportEmail.trim() } : rest;
}
