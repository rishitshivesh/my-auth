import type { CapabilityId } from "@/constants/feature-flags";
import type { CopyKey } from "@/i18n";

export type ScreenFamily = "billing" | "platformPeople" | "provisioning" | "notifications";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Suggested backend contract line; technical identifiers, never translated. */
export interface ContractRoute {
  method: HttpMethod;
  path: string;
  dto: string;
}

/**
 * One designed block of a screen. Only structure is rendered: headings,
 * column headers, field labels and disabled controls. Never rows or values.
 */
export interface SectionSpec {
  id: string;
  heading: CopyKey;
  empty: CopyKey;
  columns?: readonly CopyKey[];
  tiles?: readonly CopyKey[];
  fields?: readonly CopyKey[];
  actions?: readonly CopyKey[];
}

export interface CapabilityScreenSpec {
  family: ScreenFamily;
  /** Checklist family id, e.g. "N05". */
  checklistId: string;
  capability: CapabilityId;
  title: CopyKey;
  summary: CopyKey;
  purpose: CopyKey;
  persona: CopyKey;
  acceptance: readonly CopyKey[];
  contracts: readonly ContractRoute[];
  permissions: readonly string[];
  auditEvents: readonly string[];
  sections: readonly SectionSpec[];
}
