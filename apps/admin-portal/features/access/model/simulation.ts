import type { SimulationRequestDto, SimulationResultDto, SimulationTraceEntry } from "./types";

export interface SimulationFormValues {
  userId: string;
  action: string;
  resource: string;
  ipAddress: string;
  mfaVerified: boolean;
}

export type SimulationFieldError = "required" | "actionFormat" | "ipFormat";
export type SimulationFormErrors = Partial<Record<"userId" | "action" | "resource" | "ipAddress", SimulationFieldError>>;

const ACTION_PATTERN = /^[A-Za-z0-9_*]+:[A-Za-z0-9_*]+$|^\*$/;
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

export function isIpAddress(value: string): boolean {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

export function validateSimulation(values: SimulationFormValues): SimulationFormErrors {
  const errors: SimulationFormErrors = {};
  if (!values.userId.trim()) errors.userId = "required";
  if (!values.action.trim()) errors.action = "required";
  else if (!ACTION_PATTERN.test(values.action.trim())) errors.action = "actionFormat";
  if (!values.resource.trim()) errors.resource = "required";
  if (values.ipAddress.trim() && !isIpAddress(values.ipAddress.trim())) errors.ipAddress = "ipFormat";
  return errors;
}

export function buildSimulationRequest(values: SimulationFormValues): SimulationRequestDto {
  const ip = values.ipAddress.trim();
  return {
    userId: values.userId.trim(),
    action: values.action.trim(),
    resource: values.resource.trim(),
    ...(ip ? { ipAddress: ip } : {}),
    mfaVerified: values.mfaVerified,
  };
}

export type SimulationOutcome = "allow" | "deny";
export type SimulationExplanation = "explicitAllow" | "explicitDeny" | "implicitDeny" | "boundaryDeny";

export interface SimulationView {
  outcome: SimulationOutcome;
  explanation: SimulationExplanation;
  /** Statements that matched action, resource and condition. */
  applied: readonly SimulationTraceEntry[];
  /** Statements that matched only partly: the usual reason a rule "does not work". */
  nearMisses: readonly SimulationTraceEntry[];
  policiesEvaluated: number;
  /** Policy names reported as decisive by the service. */
  decisive: readonly string[];
}

const EXPLANATIONS: Record<SimulationResultDto["reason"], SimulationExplanation> = {
  explicit_allow: "explicitAllow",
  explicit_deny: "explicitDeny",
  implicit_deny: "implicitDeny",
  boundary_deny: "boundaryDeny",
};

function matchedParts(entry: SimulationTraceEntry): number {
  return [entry.actionMatch, entry.resourceMatch, entry.conditionMatch].filter(Boolean).length;
}

/** Turns the service result into what the screen renders; never invents trace data. */
export function toSimulationView(result: SimulationResultDto): SimulationView {
  const trace = result.trace ?? [];
  return {
    outcome: result.allowed ? "allow" : "deny",
    explanation: EXPLANATIONS[result.reason] ?? "implicitDeny",
    applied: trace.filter((e) => e.applies),
    nearMisses: trace.filter((e) => !e.applies && matchedParts(e) === 2),
    policiesEvaluated: result.policiesEvaluated ?? 0,
    decisive: (result.allowed ? result.allowedBy : result.deniedBy) ?? [],
  };
}

export function mismatchedParts(entry: SimulationTraceEntry): ("action" | "resource" | "condition")[] {
  const out: ("action" | "resource" | "condition")[] = [];
  if (!entry.actionMatch) out.push("action");
  if (!entry.resourceMatch) out.push("resource");
  if (!entry.conditionMatch) out.push("condition");
  return out;
}
