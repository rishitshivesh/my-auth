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
  PasswordPolicy,
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

export function useRoles() {
  const client = useAdminClient();
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => client.roles.list(),
    staleTime: 60_000,
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
