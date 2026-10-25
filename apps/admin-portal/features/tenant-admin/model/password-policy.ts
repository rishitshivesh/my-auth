export interface PasswordPolicy {
  minLength: number;
  requireCommonPasswordCheck: boolean;
  historyCount: number;
  maxAgeDays: number;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
}

export type PolicyField = keyof PasswordPolicy;

interface Bounds {
  min: number;
  max: number;
}

/** Bounds mirror UpdatePasswordPolicyDto. The minLength floor is the platform minimum (12). */
export const POLICY_BOUNDS: Readonly<Record<Exclude<PolicyField, "requireCommonPasswordCheck">, Bounds>> = {
  minLength: { min: 12, max: 128 },
  historyCount: { min: 0, max: 24 },
  maxAgeDays: { min: 0, max: 3650 },
  lockoutThreshold: { min: 3, max: 20 },
  lockoutDurationMinutes: { min: 1, max: 1440 },
};

export type PolicyDraft = Record<Exclude<PolicyField, "requireCommonPasswordCheck">, string> & {
  requireCommonPasswordCheck: boolean;
};

export type PolicyErrors = Partial<Record<PolicyField, "integer" | "range">>;

export function toDraft(policy: PasswordPolicy): PolicyDraft {
  return {
    minLength: String(policy.minLength),
    historyCount: String(policy.historyCount),
    maxAgeDays: String(policy.maxAgeDays),
    lockoutThreshold: String(policy.lockoutThreshold),
    lockoutDurationMinutes: String(policy.lockoutDurationMinutes),
    requireCommonPasswordCheck: policy.requireCommonPasswordCheck,
  };
}

export function validatePolicyDraft(draft: PolicyDraft): PolicyErrors {
  const errors: PolicyErrors = {};
  for (const field of Object.keys(POLICY_BOUNDS) as (keyof typeof POLICY_BOUNDS)[]) {
    const raw = draft[field].trim();
    if (!/^\d+$/.test(raw)) {
      errors[field] = "integer";
      continue;
    }
    const value = Number(raw);
    const { min, max } = POLICY_BOUNDS[field];
    if (value < min || value > max) errors[field] = "range";
  }
  return errors;
}

export function fromDraft(draft: PolicyDraft): PasswordPolicy {
  return {
    minLength: Number(draft.minLength),
    historyCount: Number(draft.historyCount),
    maxAgeDays: Number(draft.maxAgeDays),
    lockoutThreshold: Number(draft.lockoutThreshold),
    lockoutDurationMinutes: Number(draft.lockoutDurationMinutes),
    requireCommonPasswordCheck: draft.requireCommonPasswordCheck,
  };
}

export function isPolicyDirty(saved: PasswordPolicy, draft: PolicyDraft): boolean {
  const saved2 = toDraft(saved);
  return (Object.keys(saved2) as (keyof PolicyDraft)[]).some((key) => saved2[key] !== draft[key]);
}
