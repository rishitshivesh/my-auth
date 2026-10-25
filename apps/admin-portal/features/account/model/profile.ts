import type { Profile, ProfileUpdate } from "@scrolloop/sdk";
import { PROFILE_NAME_MAX_LENGTH, PROFILE_PHONE_MAX_LENGTH } from "@/constants/limits";

export interface ProfileDraft {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  timezone: string;
  language: string;
}

export type ProfileField = keyof ProfileDraft;
export type ProfileErrorKind = "tooLong" | "timezone" | "language" | "phone";
export type ProfileErrors = Partial<Record<ProfileField, ProfileErrorKind>>;

const FIELDS: readonly ProfileField[] = ["firstName", "lastName", "displayName", "phone", "timezone", "language"];
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const PHONE_PATTERN = /^[0-9+\-()\s.]+$/;

export function toDraft(profile: Profile): ProfileDraft {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    displayName: profile.displayName ?? "",
    phone: profile.phone ?? "",
    timezone: profile.timezone ?? "",
    language: profile.language ?? "",
  };
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  for (const field of ["firstName", "lastName", "displayName"] as const) {
    if (draft[field].length > PROFILE_NAME_MAX_LENGTH) errors[field] = "tooLong";
  }
  if (draft.phone) {
    if (draft.phone.length > PROFILE_PHONE_MAX_LENGTH) errors.phone = "tooLong";
    else if (!PHONE_PATTERN.test(draft.phone)) errors.phone = "phone";
  }
  if (draft.timezone && !isValidTimezone(draft.timezone)) errors.timezone = "timezone";
  if (draft.language && !LANGUAGE_PATTERN.test(draft.language)) errors.language = "language";
  return errors;
}

/** Only fields the user changed, trimmed; empty strings are not sent (server cannot clear fields). */
export function toUpdate(initial: ProfileDraft, draft: ProfileDraft): ProfileUpdate {
  const update: Record<string, string> = {};
  for (const field of FIELDS) {
    const next = draft[field].trim();
    if (next !== initial[field].trim() && next !== "") update[field] = next;
  }
  return update as ProfileUpdate;
}

/** Display name shown in headers: display name, then full name, then email. */
export function identityLabel(profile: Pick<Profile, "displayName" | "firstName" | "lastName" | "email">): string {
  if (profile.displayName) return profile.displayName;
  const full = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return full || profile.email;
}
