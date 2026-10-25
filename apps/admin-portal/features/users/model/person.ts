import type { UserDetailDto, UserListItemDto } from "./types";

export type PersonStatus = "active" | "pending" | "suspended" | "inactive";

type StatusInput = Pick<UserListItemDto, "isActive" | "emailVerified"> &
  Partial<Pick<UserDetailDto, "status" | "lockedUntil">>;

/** Single place that turns the stored flags into the status the console shows. */
export function personStatus(user: StatusInput, now: number = Date.now()): PersonStatus {
  const locked = user.lockedUntil ? new Date(user.lockedUntil).getTime() > now : false;
  if (user.status === "suspended" || locked) return "suspended";
  if (!user.isActive || user.status === "inactive") return "inactive";
  if (!user.emailVerified) return "pending";
  return "active";
}

export function personName(user: Pick<UserListItemDto, "email" | "firstName" | "lastName" | "displayName">): string {
  const display = user.displayName?.trim();
  if (display) return display;
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email;
}

export function personInitials(name: string): string {
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("");
}

export type PersonAction =
  | "edit" | "assignRoles" | "forceReset" | "suspend" | "reactivate" | "revokeSessions" | "delete";

/**
 * Which lifecycle actions make sense for a person. Self-service-destructive actions are
 * withheld for the signed-in admin (the API also blocks them); deleted users have none.
 */
export function availableActions(status: PersonStatus, isSelf: boolean, isDeleted = false): PersonAction[] {
  if (isDeleted) return [];
  const actions: PersonAction[] = ["edit", "assignRoles"];
  if (status !== "suspended") actions.push("forceReset");
  if (isSelf) return actions;
  actions.push(status === "suspended" ? "reactivate" : "suspend");
  actions.push("revokeSessions", "delete");
  return actions;
}

export type ProfileErrorCode = "tooLong" | "phoneFormat";
export interface ProfileValues {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
}
export type ProfileErrors = Partial<Record<keyof ProfileValues, ProfileErrorCode>>;

const NAME_MAX = 80;
const PHONE = /^\+?[0-9 ()-]{6,20}$/;

export function validateProfile(values: ProfileValues): ProfileErrors {
  const errors: ProfileErrors = {};
  for (const key of ["firstName", "lastName", "displayName"] as const) {
    if (values[key].trim().length > NAME_MAX) errors[key] = "tooLong";
  }
  if (values.phone.trim() && !PHONE.test(values.phone.trim())) errors.phone = "phoneFormat";
  return errors;
}

export function profileValuesOf(user: UserDetailDto): ProfileValues {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
  };
}

/** Only changed fields are sent, so a save never overwrites data the form did not touch. */
export function profileChanges(original: ProfileValues, next: ProfileValues): Partial<ProfileValues> {
  const out: Partial<ProfileValues> = {};
  for (const key of Object.keys(next) as (keyof ProfileValues)[]) {
    if (next[key].trim() !== original[key].trim()) out[key] = next[key].trim();
  }
  return out;
}
