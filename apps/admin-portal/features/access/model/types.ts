/** Wire types for the tenant RBAC API (apps/auth-service/src/modules/rbac). */

export interface PermissionDto {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string | null;
  scope: string;
  isSystem: boolean;
}

export interface RoleDto {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  rolePermissions?: readonly { permission?: PermissionDto }[];
}

export type PolicyEffect = "Allow" | "Deny";

export interface PolicyStatementDto {
  Sid?: string;
  Effect: PolicyEffect;
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, unknown>;
}

export interface PolicyDocumentDto {
  Version: string;
  Statement: PolicyStatementDto[];
}

export interface PolicyDto {
  id: string;
  name: string;
  description?: string | null;
  document: PolicyDocumentDto;
  isSystem: boolean;
  type: "inline" | "managed";
  createdAt: string;
  updatedAt: string;
}

export interface PolicyListDto {
  data: PolicyDto[];
  total: number;
}

export interface GroupDto {
  id: string;
  name: string;
  description: string | null;
  parentGroupId: string | null;
  path: string;
  isSystem: boolean;
  createdAt: string;
}

export interface GroupMemberDto {
  id: string;
  userId: string;
  groupId: string;
  createdAt: string;
}

export interface GroupPolicyLinkDto {
  id: string;
  policyId: string;
  policy?: PolicyDto;
}

export interface GroupDetailDto {
  group: GroupDto;
  members: GroupMemberDto[];
  policies: GroupPolicyLinkDto[];
}

export type SimulationReason = "explicit_allow" | "explicit_deny" | "implicit_deny" | "boundary_deny";

export interface SimulationTraceEntry {
  policyName: string;
  statementSid?: string;
  effect: PolicyEffect;
  actionMatch: boolean;
  resourceMatch: boolean;
  conditionMatch: boolean;
  applies: boolean;
}

export interface SimulationResultDto {
  allowed: boolean;
  reason: SimulationReason;
  deniedBy?: string[];
  allowedBy?: string[];
  trace: SimulationTraceEntry[];
  policiesEvaluated: number;
}

export interface SimulationRequestDto {
  userId: string;
  action: string;
  resource: string;
  ipAddress?: string;
  mfaVerified?: boolean;
}
