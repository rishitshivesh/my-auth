import { isCapabilityEnabled } from "@/constants/feature-flags";
import type { CapabilityScreenSpec } from "./types";

/** A screen may only show its planned shell while its flag is off. */
export function isPlannedShell(spec: CapabilityScreenSpec): boolean {
  return !isCapabilityEnabled(spec.capability);
}

/** Handoff is complete when every required part is present. */
export function missingHandoffParts(spec: CapabilityScreenSpec): string[] {
  const missing: string[] = [];
  if (spec.contracts.length === 0) missing.push("contracts");
  if (spec.permissions.length === 0) missing.push("permissions");
  if (spec.auditEvents.length === 0) missing.push("auditEvents");
  if (spec.acceptance.length === 0) missing.push("acceptance");
  if (spec.sections.length === 0) missing.push("sections");
  return missing;
}
