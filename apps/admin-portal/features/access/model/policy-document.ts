import type { PolicyDocumentDto, PolicyStatementDto } from "./types";

export const POLICY_VERSION = "2024-01-01";

export type PolicyIssueCode =
  | "invalidJson" | "notObject" | "version" | "noStatements" | "statementShape" | "effect" | "action" | "resource";

export interface PolicyIssue {
  code: PolicyIssueCode;
  /** Zero-based statement index when the issue belongs to one statement. */
  statement?: number;
}

export type PolicyParseResult =
  | { ok: true; document: PolicyDocumentDto }
  | { ok: false; issues: readonly PolicyIssue[] };

function isStringOrStringList(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && v.trim().length > 0);
}

function checkStatement(raw: unknown, index: number): PolicyIssue[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [{ code: "statementShape", statement: index }];
  }
  const statement = raw as Record<string, unknown>;
  const issues: PolicyIssue[] = [];
  if (statement.Effect !== "Allow" && statement.Effect !== "Deny") issues.push({ code: "effect", statement: index });
  if (!isStringOrStringList(statement.Action)) issues.push({ code: "action", statement: index });
  if (!isStringOrStringList(statement.Resource)) issues.push({ code: "resource", statement: index });
  return issues;
}

/** Parses editor text into a policy document, reporting every structural problem found. */
export function parsePolicyJson(text: string): PolicyParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ code: "invalidJson" }] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, issues: [{ code: "notObject" }] };
  }
  const doc = parsed as Record<string, unknown>;
  const issues: PolicyIssue[] = [];
  if (typeof doc.Version !== "string" || !doc.Version.trim()) issues.push({ code: "version" });
  if (!Array.isArray(doc.Statement) || doc.Statement.length === 0) {
    issues.push({ code: "noStatements" });
  } else {
    doc.Statement.forEach((raw, index) => issues.push(...checkStatement(raw, index)));
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document: parsed as PolicyDocumentDto };
}

export function formatPolicy(document: PolicyDocumentDto): string {
  return JSON.stringify(document, null, 2);
}

export function newPolicyTemplate(): PolicyDocumentDto {
  return {
    Version: POLICY_VERSION,
    Statement: [{ Sid: "ExampleAllowRead", Effect: "Allow", Action: ["users:read"], Resource: ["*"] }],
  };
}

export function asList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export function hasExplicitDeny(document: PolicyDocumentDto): boolean {
  return document.Statement.some((s: PolicyStatementDto) => s.Effect === "Deny");
}

export interface StatementSummary {
  key: string;
  effect: PolicyStatementDto["Effect"];
  actions: readonly string[];
  resources: readonly string[];
  hasCondition: boolean;
}

export function summarizeStatements(document: PolicyDocumentDto): StatementSummary[] {
  return document.Statement.map((s, index) => ({
    key: s.Sid ?? `statement-${index}`,
    effect: s.Effect,
    actions: asList(s.Action),
    resources: asList(s.Resource),
    hasCondition: Boolean(s.Condition && Object.keys(s.Condition).length > 0),
  }));
}
