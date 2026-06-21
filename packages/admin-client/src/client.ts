import { SentryAxiosTransport } from '@scrolloop/sentry-config/transport';
import type {
  PaginatedResult, UserFilters, AuditFilters,
  Role, Permission, Policy, Group, OAuthClient,
  AuditEvent, DashboardStats, LoginActivityPoint,
  TenantDetail, PasswordPolicy, SimulationRequest, SimulationResult,
} from './types.js';
import type { User, Session } from '@scrolloop/types';

export class SentryAdminClient {
  constructor(private readonly transport: SentryAxiosTransport) {}

  readonly users = {
    list: (filters?: UserFilters): Promise<PaginatedResult<User>> =>
      this.transport.get('/api/admin/users', filters as Record<string, unknown>),

    get: (id: string): Promise<User> =>
      this.transport.get(`/api/admin/users/${id}`),

    update: (id: string, data: Partial<User>): Promise<User> =>
      this.transport.patch(`/api/admin/users/${id}`, data),

    lock: (id: string, reason: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${id}/lock`, { reason }),

    unlock: (id: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${id}/unlock`),

    forcePasswordReset: (id: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${id}/force-password-reset`),

    delete: (id: string): Promise<void> =>
      this.transport.delete(`/api/admin/users/${id}`),

    invite: (data: { email: string; roleIds?: string[] }): Promise<void> =>
      this.transport.post('/users/invite', data),
  };

  readonly sessions = {
    listForUser: (userId: string): Promise<Session[]> =>
      this.transport.get(`/api/admin/users/${userId}/sessions`),

    revoke: (sessionId: string): Promise<void> =>
      this.transport.delete(`/api/session/${sessionId}`),

    revokeAll: (userId: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${userId}/sessions/revoke-all`),
  };

  readonly roles = {
    list: (): Promise<Role[]> =>
      this.transport.get('/api/rbac/roles'),

    get: (id: string): Promise<Role> =>
      this.transport.get(`/api/rbac/roles/${id}`),

    create: (data: { name: string; description?: string }): Promise<Role> =>
      this.transport.post('/api/rbac/roles', data),

    update: (id: string, data: Partial<Pick<Role, 'name' | 'description'>>): Promise<Role> =>
      this.transport.patch(`/api/rbac/roles/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.transport.delete(`/api/rbac/roles/${id}`),

    assignToUser: (userId: string, roleId: string): Promise<void> =>
      this.transport.post(`/api/rbac/users/${userId}/roles`, { roleId }),

    removeFromUser: (userId: string, roleId: string): Promise<void> =>
      this.transport.delete(`/api/rbac/users/${userId}/roles/${roleId}`),
  };

  readonly permissions = {
    list: (): Promise<Permission[]> =>
      this.transport.get('/api/rbac/permissions'),
  };

  readonly policies = {
    list: (): Promise<Policy[]> =>
      this.transport.get('/api/rbac/policies'),

    get: (id: string): Promise<Policy> =>
      this.transport.get(`/api/rbac/policies/${id}`),

    create: (data: { name: string; document: Policy['document'] }): Promise<Policy> =>
      this.transport.post('/api/rbac/policies', data),

    update: (id: string, data: Partial<Policy>): Promise<Policy> =>
      this.transport.patch(`/api/rbac/policies/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.transport.delete(`/api/rbac/policies/${id}`),

    simulate: (req: SimulationRequest): Promise<SimulationResult> =>
      this.transport.post('/api/rbac/policies/simulate', req),

    attachToRole: (roleId: string, policyId: string): Promise<void> =>
      this.transport.post(`/api/rbac/roles/${roleId}/policies`, { policyId }),

    detachFromRole: (roleId: string, policyId: string): Promise<void> =>
      this.transport.delete(`/api/rbac/roles/${roleId}/policies/${policyId}`),
  };

  readonly groups = {
    list: (): Promise<Group[]> =>
      this.transport.get('/api/rbac/groups'),

    get: (id: string): Promise<Group> =>
      this.transport.get(`/api/rbac/groups/${id}`),

    create: (data: { name: string; parentGroupId?: string }): Promise<Group> =>
      this.transport.post('/api/rbac/groups', data),

    delete: (id: string): Promise<void> =>
      this.transport.delete(`/api/rbac/groups/${id}`),

    addMember: (groupId: string, userId: string): Promise<void> =>
      this.transport.post(`/api/rbac/groups/${groupId}/members`, { userId }),

    removeMember: (groupId: string, userId: string): Promise<void> =>
      this.transport.delete(`/api/rbac/groups/${groupId}/members/${userId}`),
  };

  readonly clients = {
    list: (): Promise<OAuthClient[]> =>
      this.transport.get('/api/oauth/clients'),

    get: (id: string): Promise<OAuthClient> =>
      this.transport.get(`/api/oauth/clients/${id}`),

    create: (data: { name: string; type: OAuthClient['type'] }): Promise<OAuthClient & { clientSecret: string }> =>
      this.transport.post('/api/oauth/clients', data),

    update: (id: string, data: Partial<OAuthClient>): Promise<OAuthClient> =>
      this.transport.patch(`/api/oauth/clients/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.transport.delete(`/api/oauth/clients/${id}`),

    rotate: (id: string): Promise<{ clientSecret: string }> =>
      this.transport.post(`/api/oauth/clients/${id}/rotate`),
  };

  readonly audit = {
    list: (filters?: AuditFilters): Promise<PaginatedResult<AuditEvent>> =>
      this.transport.get('/api/audit', filters as Record<string, unknown>),
  };

  readonly stats = {
    getDashboard: (): Promise<DashboardStats> =>
      this.transport.get('/api/admin/stats/dashboard'),

    getLoginActivity: (days: number): Promise<LoginActivityPoint[]> =>
      this.transport.get('/api/admin/stats/login-activity', { days }),
  };

  readonly tenant = {
    get: (): Promise<TenantDetail> =>
      this.transport.get('/api/tenant'),

    update: (data: Partial<TenantDetail>): Promise<TenantDetail> =>
      this.transport.patch('/api/tenant', data),

    getPasswordPolicy: (): Promise<PasswordPolicy> =>
      this.transport.get('/api/tenant/password-policy'),

    updatePasswordPolicy: (data: PasswordPolicy): Promise<PasswordPolicy> =>
      this.transport.patch('/api/tenant/password-policy', data),

    uploadLogo: (file: File): Promise<{ url: string }> => {
      const form = new FormData();
      form.append('logo', file);
      return this.transport.upload('/api/tenant/logo', form);
    },

    delete: (): Promise<void> =>
      this.transport.delete('/api/tenant'),
  };
}
