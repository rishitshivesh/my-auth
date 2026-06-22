'use client';
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { useAdminClient } from './provider';
import type {
  UserFilters,
  AuditFilters,
  TenantDetail,
  TenantMfaPolicy,
  PasswordPolicy,
  CreateRoleDto,
  UpdateRoleDto,
  CreatePolicyDto,
  UpdatePolicyDto,
  CreateGroupDto,
  CreateClientDto,
  UpdateClientDto,
  SimulationRequest,
} from '../types';

export function useUsers(filters?: UserFilters) {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => client.users.list(filters),
    staleTime: 30_000,
  });
}

export function useUser(id: string) {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => client.users.get(id),
    staleTime: 30_000,
    enabled: !!id,
  });
}

export function useLockUser() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      client.users.lock(userId, reason),
    onSuccess: (_, { userId }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useUnlockUser() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => client.users.unlock(userId),
    onSuccess: (_, userId) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useForcePasswordReset() {
  const client = useAdminClient();
  return useMutation({
    mutationFn: (userId: string) => client.users.forcePasswordReset(userId),
  });
}

export function useDeleteUser() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => client.users.delete(userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useInviteUser() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; roleIds?: string[] }) =>
      client.users.invite(data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useSuspendUser() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      client.users.suspend(userId, reason),
    onSuccess: (_, { userId }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useRestoreUser() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => client.users.restore(userId),
    onSuccess: (_, userId) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useExportUsers() {
  const client = useAdminClient();
  return useMutation({
    mutationFn: (filters?: UserFilters) => client.users.exportCsv(filters),
  });
}

export function useUserSessions(userId: string, options?: { enabled?: boolean }) {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'sessions', userId],
    queryFn: () => client.sessions.listForUser(userId),
    enabled: !!userId && (options?.enabled ?? true),
  });
}

export function useRevokeSession() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, userId }: { sessionId: string; userId: string }) =>
      client.sessions.revoke(sessionId),
    onSuccess: (_, { userId }) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'sessions', userId] }),
  });
}

export function useRevokeAllSessions() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => client.sessions.revokeAllForUser(userId),
    onSuccess: (_, userId) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'sessions', userId] }),
  });
}

export function useRoles() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => client.roles.list(),
    staleTime: 60_000,
  });
}

export function useRole(id: string) {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'role', id],
    queryFn: () => client.roles.get(id),
    staleTime: 60_000,
    enabled: !!id,
  });
}

export function useCreateRole() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRoleDto) => client.roles.create(data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  });
}

export function useUpdateRole() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleDto }) =>
      client.roles.update(id, data),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'role', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
  });
}

export function useDeleteRole() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.roles.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  });
}

export function useAssignRole() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      client.roles.assignToUser(userId, roleId),
    onSuccess: (_, { userId }) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] }),
  });
}

export function useRemoveRole() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      client.roles.removeFromUser(userId, roleId),
    onSuccess: (_, { userId }) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] }),
  });
}

export function usePermissions() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => client.permissions.list(),
    staleTime: 60_000,
  });
}

export function usePolicies() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'policies'],
    queryFn: () => client.policies.list(),
    staleTime: 60_000,
  });
}

export function usePolicy(id: string) {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'policy', id],
    queryFn: () => client.policies.get(id),
    staleTime: 60_000,
    enabled: !!id,
  });
}

export function useCreatePolicy() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePolicyDto) => client.policies.create(data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'policies'] }),
  });
}

export function useUpdatePolicy() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePolicyDto }) =>
      client.policies.update(id, data),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'policy', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'policies'] });
    },
  });
}

export function useDeletePolicy() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.policies.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'policies'] }),
  });
}

export function useSimulatePolicy() {
  const client = useAdminClient();
  return useMutation({
    mutationFn: (req: SimulationRequest) => client.policies.simulate(req),
  });
}

export function useAttachPolicy() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, policyId }: { roleId: string; policyId: string }) =>
      client.policies.attachToRole(roleId, policyId),
    onSuccess: (_, { roleId }) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'role', roleId] }),
  });
}

export function useDetachPolicy() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, policyId }: { roleId: string; policyId: string }) =>
      client.policies.detachFromRole(roleId, policyId),
    onSuccess: (_, { roleId }) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'role', roleId] }),
  });
}

export function useGroups() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: () => client.groups.list(),
    staleTime: 60_000,
  });
}

export function useOAuthClients() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: () => client.clients.list(),
    staleTime: 60_000,
  });
}

export function useAuditLog(filters?: AuditFilters, options?: { enabled?: boolean }) {
  const client = useAdminClient();
  return useInfiniteQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: ({ pageParam }) =>
      client.audit.list({ ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useDashboardStats() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'stats', 'dashboard'],
    queryFn: () => client.stats.getDashboard(),
    staleTime: 60_000,
  });
}

export function useLoginActivity(days = 14) {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'stats', 'login-activity', days],
    queryFn: () => client.stats.getLoginActivity(days),
    staleTime: 60_000,
  });
}

export function useTenant() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'tenant'],
    queryFn: () => client.tenant.get(),
    staleTime: 120_000,
  });
}

export function useUpdateTenant() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<TenantDetail>) => client.tenant.update(data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'tenant'] }),
  });
}

export function usePasswordPolicy() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'tenant', 'password-policy'],
    queryFn: () => client.tenant.getPasswordPolicy(),
    staleTime: 120_000,
  });
}

export function useUpdatePasswordPolicy() {
  const client = useAdminClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PasswordPolicy) => client.tenant.updatePasswordPolicy(data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'tenant'] }),
  });
}
