import type { CopyKey } from "@/i18n";

/**
 * Proposed capabilities: designed in Figma but with no backend contract.
 * Flags are static `false` on purpose; flipping one is a code change made
 * together with the backend work, never an environment toggle that could
 * expose fake data. Until then routes render the honest ProposedCapability shell.
 */
export const PROPOSED_CAPABILITIES = {
  groups: true,
  domains: false,
  ownership: false,
  billing: false,
  serviceCredentials: false,
  privacy: false,
  provisioning: false,
  notifications: false,
  developer: false,
  consent: false,
  personalActivity: true,
  accountDeletion: true,
  passwordless: false,
  notAvailableForPlatform: false,
} as const satisfies Record<string, boolean>;

export type CapabilityId = keyof typeof PROPOSED_CAPABILITIES;

export const CAPABILITY_IDS = Object.keys(PROPOSED_CAPABILITIES) as CapabilityId[];

export function isCapabilityEnabled(id: CapabilityId): boolean {
  return PROPOSED_CAPABILITIES[id];
}

export interface CapabilityCopyKeys {
  title: CopyKey;
  summary: CopyKey;
  requirements: readonly CopyKey[];
  contract: CopyKey;
}

/** Copy keys for a capability; template types fail tsc if the catalogue lacks an entry. */
export function capabilityCopy(id: CapabilityId): CapabilityCopyKeys {
  return {
    title: `states.capabilities.${id}.title`,
    summary: `states.capabilities.${id}.summary`,
    requirements: [
      `states.capabilities.${id}.req1`,
      `states.capabilities.${id}.req2`,
      `states.capabilities.${id}.req3`,
    ],
    contract: `states.capabilities.${id}.contract`,
  };
}
