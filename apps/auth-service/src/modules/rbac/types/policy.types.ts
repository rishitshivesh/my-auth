export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatement[];
}

export interface PolicyStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Principal?: string | string[] | '*';
  Action: string | string[];
  Resource: string | string[];
  Condition?: PolicyCondition;
}

export interface PolicyCondition {
  IpAddress?: { 'sentry:SourceIp': string | string[] };
  DateGreaterThan?: { 'sentry:CurrentTime': string };
  DateLessThan?: { 'sentry:CurrentTime': string };
  Bool?: { 'sentry:MultiFactorAuthPresent': boolean };
  StringEquals?: Record<string, string | string[]>;
}

export interface EvaluationContext {
  ipAddress: string;
  mfaVerified: boolean;
  timestamp?: Date;
  attributes?: Record<string, string>;
}

export interface EvaluationRequest {
  userId: string;
  tenantId: string;
  action: string;
  resource: string;
  context: EvaluationContext;
}

export interface EvaluationResult {
  allowed: boolean;
  reason: 'explicit_deny' | 'explicit_allow' | 'implicit_deny' | 'boundary_deny';
  deniedBy?: string[];
  allowedBy?: string[];
}

export interface SimulationRequest extends EvaluationRequest {}

export interface TraceEntry {
  policyName: string;
  statementSid?: string;
  effect: 'Allow' | 'Deny';
  actionMatch: boolean;
  resourceMatch: boolean;
  conditionMatch: boolean;
  applies: boolean;
}

export interface SimulationResult extends EvaluationResult {
  trace: TraceEntry[];
  policiesEvaluated: number;
}
