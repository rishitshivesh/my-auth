import { tenantRequest, toQueryString } from "@/lib/tenant-api";
import type {
  GroupDetailDto, GroupDto, PermissionDto, PolicyDocumentDto, PolicyDto, PolicyListDto, RoleDto,
  SimulationRequestDto, SimulationResultDto,
} from "../model/types";

const seg = encodeURIComponent;

export const accessApi = {
  roles: (loadPermissions = true) =>
    tenantRequest<RoleDto[]>(`/rbac/roles${toQueryString({ loadPermissions })}`),
  role: (id: string) => tenantRequest<RoleDto>(`/rbac/roles/${seg(id)}?loadPermissions=true`),
  createRole: (body: { name: string; displayName?: string; description?: string; permissionNames?: string[] }) =>
    tenantRequest<RoleDto>("/rbac/roles", "POST", body),
  updateRole: (id: string, body: { displayName?: string; description?: string; isActive?: boolean }) =>
    tenantRequest<RoleDto>(`/rbac/roles/${seg(id)}`, "PUT", body),
  deleteRole: (id: string) => tenantRequest<void>(`/rbac/roles/${seg(id)}`, "DELETE"),
  addRolePermissions: (id: string, permissionNames: string[]) =>
    tenantRequest<unknown>(`/rbac/roles/${seg(id)}/permissions`, "POST", { permissionNames }),
  removeRolePermissions: (id: string, permissionNames: string[]) =>
    tenantRequest<unknown>(`/rbac/roles/${seg(id)}/permissions`, "DELETE", { permissionNames }),
  rolePolicies: (id: string) => tenantRequest<PolicyDto[]>(`/rbac/roles/${seg(id)}/policies`),
  attachRolePolicy: (roleId: string, policyId: string) =>
    tenantRequest<unknown>(`/rbac/roles/${seg(roleId)}/policies/${seg(policyId)}`, "POST"),
  detachRolePolicy: (roleId: string, policyId: string) =>
    tenantRequest<unknown>(`/rbac/roles/${seg(roleId)}/policies/${seg(policyId)}`, "DELETE"),

  permissions: () => tenantRequest<PermissionDto[]>("/rbac/permissions"),
  createPermission: (body: { name: string; resource: string; action: string; description?: string }) =>
    tenantRequest<PermissionDto>("/rbac/permissions", "POST", body),
  updatePermission: (id: string, body: { description?: string }) =>
    tenantRequest<PermissionDto>(`/rbac/permissions/${seg(id)}`, "PUT", body),
  deletePermission: (id: string) => tenantRequest<void>(`/rbac/permissions/${seg(id)}`, "DELETE"),

  policies: () => tenantRequest<PolicyListDto>("/rbac/policies?limit=100"),
  createPolicy: (body: { name: string; description?: string; document: PolicyDocumentDto; type?: "inline" | "managed" }) =>
    tenantRequest<PolicyDto>("/rbac/policies", "POST", body),
  updatePolicy: (id: string, body: { description?: string; document?: PolicyDocumentDto }) =>
    tenantRequest<PolicyDto>(`/rbac/policies/${seg(id)}`, "PUT", body),
  deletePolicy: (id: string) => tenantRequest<void>(`/rbac/policies/${seg(id)}`, "DELETE"),
  simulate: (body: SimulationRequestDto) =>
    tenantRequest<SimulationResultDto>("/rbac/policies/simulate", "POST", body),

  groups: () => tenantRequest<GroupDto[]>("/rbac/groups"),
  group: (id: string) => tenantRequest<GroupDetailDto>(`/rbac/groups/${seg(id)}`),
  createGroup: (body: { name: string; description?: string; parentGroupId?: string }) =>
    tenantRequest<GroupDto>("/rbac/groups", "POST", body),
  updateGroup: (id: string, body: { name?: string; description?: string }) =>
    tenantRequest<GroupDto>(`/rbac/groups/${seg(id)}`, "PUT", body),
  deleteGroup: (id: string) => tenantRequest<void>(`/rbac/groups/${seg(id)}`, "DELETE"),
  addGroupMember: (groupId: string, userId: string) =>
    tenantRequest<unknown>(`/rbac/groups/${seg(groupId)}/members/${seg(userId)}`, "POST"),
  removeGroupMember: (groupId: string, userId: string) =>
    tenantRequest<unknown>(`/rbac/groups/${seg(groupId)}/members/${seg(userId)}`, "DELETE"),
  attachGroupPolicy: (groupId: string, policyId: string) =>
    tenantRequest<unknown>(`/rbac/groups/${seg(groupId)}/policies/${seg(policyId)}`, "POST"),
  detachGroupPolicy: (groupId: string, policyId: string) =>
    tenantRequest<unknown>(`/rbac/groups/${seg(groupId)}/policies/${seg(policyId)}`, "DELETE"),

  userRoles: (userId: string) => tenantRequest<RoleDto[]>(`/rbac/users/${seg(userId)}/roles`),
  userPermissions: (userId: string) => tenantRequest<PermissionDto[]>(`/rbac/users/${seg(userId)}/permissions`),
  assignUserRoles: (userId: string, body: { roleNames: string[]; reason?: string; expiresAt?: string }) =>
    tenantRequest<unknown>(`/rbac/users/${seg(userId)}/roles`, "POST", body),
  revokeUserRole: (userId: string, roleName: string) =>
    tenantRequest<unknown>(`/rbac/users/${seg(userId)}/roles/${seg(roleName)}`, "DELETE"),
};
