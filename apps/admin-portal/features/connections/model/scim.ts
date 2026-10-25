import type { CreateScimTokenBody, ScimTokenRecord } from "./types";

export const SCIM_EXPIRY_OPTIONS = ["never", "30", "90", "365"] as const;
export type ScimExpiry = (typeof SCIM_EXPIRY_OPTIONS)[number];

export interface ScimDraft {
  name: string;
  expiry: ScimExpiry;
}

export const EMPTY_SCIM_DRAFT: ScimDraft = { name: "", expiry: "90" };

export function validateScimDraft(draft: ScimDraft): "name"[] {
  return draft.name.trim() === "" ? ["name"] : [];
}

export function toScimBody(draft: ScimDraft): CreateScimTokenBody {
  return {
    name: draft.name.trim(),
    ...(draft.expiry === "never" ? {} : { expiresInDays: Number(draft.expiry) }),
  };
}

export function filterScimTokens(rows: readonly ScimTokenRecord[], search: string): ScimTokenRecord[] {
  const needle = search.trim().toLowerCase();
  return needle === "" ? [...rows] : rows.filter((r) => r.name.toLowerCase().includes(needle));
}

export function isExpired(token: Pick<ScimTokenRecord, "expiresAt">, now: Date): boolean {
  return Boolean(token.expiresAt) && new Date(token.expiresAt as string).getTime() <= now.getTime();
}
