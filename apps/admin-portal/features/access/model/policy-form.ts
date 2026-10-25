import { formatPolicy, newPolicyTemplate, parsePolicyJson, type PolicyParseResult } from "./policy-document";
import type { PolicyDto } from "./types";

export interface PolicyFormValues {
  name: string;
  description: string;
  type: "inline" | "managed";
  json: string;
}

export type PolicyNameError = "required" | "tooLong";

const NAME_MAX = 128;

export function initialPolicyForm(policy?: PolicyDto): PolicyFormValues {
  return policy
    ? { name: policy.name, description: policy.description ?? "", type: policy.type, json: formatPolicy(policy.document) }
    : { name: "", description: "", type: "inline", json: formatPolicy(newPolicyTemplate()) };
}

export interface PolicyFormState {
  nameError?: PolicyNameError;
  parsed: PolicyParseResult;
  canSubmit: boolean;
}

/** Name is only checked when creating; policy names cannot change afterwards. */
export function evaluatePolicyForm(values: PolicyFormValues, mode: "create" | "edit"): PolicyFormState {
  const name = values.name.trim();
  const nameError: PolicyNameError | undefined =
    mode === "edit" ? undefined : !name ? "required" : name.length > NAME_MAX ? "tooLong" : undefined;
  const parsed = parsePolicyJson(values.json);
  return { nameError, parsed, canSubmit: !nameError && parsed.ok };
}
