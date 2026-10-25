import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { Permission, Policy, PolicyDocument, SimulateResult, UserRoleAssignment } from "@/lib/types";
import { apiUrl } from "./shared";

// ── RBAC: Permissions ────────────────────────────────────────────

export function usePermissions() {
  return useQuery<Permission[]>({
    queryKey: ['rbac', 'permissions'],
    queryFn: withErrorHandler<[], Permission[]>(
      async () => authClient.request({ url: apiUrl('/rbac/permissions'), method: 'GET' })
    ),
  });
}

export function useAssignPermissionsToRole() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { roleId: string; permissionNames: string[] }>({
    mutationFn: withErrorHandler<[{ roleId: string; permissionNames: string[] }], { message: string }>(
      async ({ roleId, permissionNames }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/permissions`),
        method: 'POST',
        body: { permissionNames },
      }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'roles'] }),
  });
}

export function useRemovePermissionsFromRole() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { roleId: string; permissionNames: string[] }>({
    mutationFn: withErrorHandler<[{ roleId: string; permissionNames: string[] }], { message: string }>(
      async ({ roleId, permissionNames }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/permissions`),
        method: 'DELETE',
        body: { permissionNames },
      }),
      { showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'roles'] }),
  });
}

export function useRolePolicies(roleId: string) {
  return useQuery<Policy[]>({
    queryKey: ['rbac', 'roles', roleId, 'policies'],
    queryFn: withErrorHandler<[], Policy[]>(
      async () => authClient.request({ url: apiUrl(`/rbac/roles/${roleId}/policies`), method: 'GET' })
    ),
    enabled: !!roleId,
  });
}

// ── RBAC: User Roles ────────────────────────────────────────────

export function useUserRoles(userId: string) {
  return useQuery<UserRoleAssignment[]>({
    queryKey: ['rbac', 'users', userId, 'roles'],
    queryFn: withErrorHandler<[], UserRoleAssignment[]>(
      async () => authClient.request({ url: apiUrl(`/rbac/users/${userId}/roles`), method: 'GET' })
    ),
    enabled: !!userId,
  });
}

export function useAssignRolesToUser() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { userId: string; roleNames: string[]; expiresAt?: string; reason?: string }>({
    mutationFn: withErrorHandler<[{ userId: string; roleNames: string[]; expiresAt?: string; reason?: string }], { message: string }>(
      async ({ userId, ...body }) => authClient.request({
        url: apiUrl(`/rbac/users/${userId}/roles`),
        method: 'POST',
        body,
      }),
      { successMessage: 'Role assigned', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { userId }) => qc.invalidateQueries({ queryKey: ['rbac', 'users', userId, 'roles'] }),
  });
}

export function useRevokeRoleFromUser() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, Error, { userId: string; roleName: string }>({
    mutationFn: withErrorHandler<[{ userId: string; roleName: string }], { message: string }>(
      async ({ userId, roleName }) => authClient.request({
        url: apiUrl(`/rbac/users/${userId}/roles/${roleName}`),
        method: 'DELETE',
      }),
      { successMessage: 'Role revoked', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { userId }) => qc.invalidateQueries({ queryKey: ['rbac', 'users', userId, 'roles'] }),
  });
}

/** The signed-in user's own role assignments (no permission needed to read). */
export function useMyRoles(enabled = true) {
  return useQuery<Array<{ name: string; isSystem?: boolean }>>({
    queryKey: ['rbac', 'me', 'roles'],
    queryFn: withErrorHandler<[], Array<{ name: string; isSystem?: boolean }>>(
      async () => authClient.request({ url: apiUrl('/rbac/me/roles'), method: 'GET' })
    ),
    enabled,
  });
}

/** The signed-in user's own role-attached permissions (readable without `users:read`). */
export function useMyPermissions(enabled = true) {
  return useQuery<Permission[]>({
    queryKey: ['rbac', 'me', 'permissions'],
    queryFn: withErrorHandler<[], Permission[]>(
      async () => authClient.request({ url: apiUrl('/rbac/me/permissions'), method: 'GET' })
    ),
    enabled,
  });
}

export function useUserEffectivePermissions(userId: string) {
  return useQuery<Permission[]>({
    queryKey: ['rbac', 'users', userId, 'permissions'],
    queryFn: withErrorHandler<[], Permission[]>(
      async () => authClient.request({ url: apiUrl(`/rbac/users/${userId}/permissions`), method: 'GET' })
    ),
    enabled: !!userId,
  });
}

// ── RBAC: Policies ────────────────────────────────────────────

export function usePolicies() {
  return useQuery<{ data: Policy[]; total: number }>({
    queryKey: ['rbac', 'policies'],
    queryFn: withErrorHandler<[], { data: Policy[]; total: number }>(
      async () => authClient.request({ url: apiUrl('/rbac/policies?limit=100'), method: 'GET' })
    ),
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation<Policy, Error, { name: string; description?: string; document: PolicyDocument; type?: 'inline' | 'managed' }>({
    mutationFn: withErrorHandler<[{ name: string; description?: string; document: PolicyDocument; type?: 'inline' | 'managed' }], Policy>(
      async (body) => authClient.request({
        url: apiUrl('/rbac/policies'),
        method: 'POST',
        body,
      }),
      { successMessage: 'Policy created', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'policies'] }),
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation<Policy, Error, { id: string; description?: string; document?: PolicyDocument }>({
    mutationFn: withErrorHandler<[{ id: string; description?: string; document?: PolicyDocument }], Policy>(
      async ({ id, ...body }) => authClient.request({
        url: apiUrl(`/rbac/policies/${id}`),
        method: 'PUT',
        body,
      }),
      { successMessage: 'Policy updated', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'policies'] }),
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id) => authClient.request({
        url: apiUrl(`/rbac/policies/${id}`),
        method: 'DELETE',
      }),
      { successMessage: 'Policy deleted', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'policies'] }),
  });
}

export function useAttachPolicyToRole() {
  const qc = useQueryClient();
  return useMutation<void, Error, { roleId: string; policyId: string }>({
    mutationFn: withErrorHandler<[{ roleId: string; policyId: string }], void>(
      async ({ roleId, policyId }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/policies/${policyId}`),
        method: 'POST',
      }),
      { successMessage: 'Policy attached', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { roleId }) => qc.invalidateQueries({ queryKey: ['rbac', 'roles', roleId, 'policies'] }),
  });
}

export function useDetachPolicyFromRole() {
  const qc = useQueryClient();
  return useMutation<void, Error, { roleId: string; policyId: string }>({
    mutationFn: withErrorHandler<[{ roleId: string; policyId: string }], void>(
      async ({ roleId, policyId }) => authClient.request({
        url: apiUrl(`/rbac/roles/${roleId}/policies/${policyId}`),
        method: 'DELETE',
      }),
      { successMessage: 'Policy detached', showSuccessToast: true, showErrorToast: true }
    ),
    onSuccess: (_, { roleId }) => qc.invalidateQueries({ queryKey: ['rbac', 'roles', roleId, 'policies'] }),
  });
}

export function useSimulatePolicy() {
  return useMutation<SimulateResult, Error, { userId: string; action: string; resource: string; ipAddress?: string; mfaVerified?: boolean }>({
    mutationFn: withErrorHandler<[{ userId: string; action: string; resource: string; ipAddress?: string; mfaVerified?: boolean }], SimulateResult>(
      async (body) => authClient.request({
        url: apiUrl('/rbac/policies/simulate'),
        method: 'POST',
        body,
      }),
      { showErrorToast: true }
    ),
  });
}
