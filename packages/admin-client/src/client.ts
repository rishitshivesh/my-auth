import { SentryAxiosTransport } from '@scrolloop/sentry-config/transport';
import type {
  PaginatedResult, UserFilters, AuditFilters,
  Role, RoleWithPolicies, Permission, Policy, Group, OAuthClient,
  AuditEvent, DashboardStats, LoginActivityPoint, LoginActivityData,
  TenantDetail, TenantBranding, TenantMfaPolicy, PasswordPolicy,
  SimulationRequest, SimulationResult,
  MfaFactor, WorkspaceMembership,
  CreateRoleDto, UpdateRoleDto, CreatePolicyDto, UpdatePolicyDto,
  CreateGroupDto, CreateClientDto, UpdateClientDto,
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

    suspend: (id: string, reason: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${id}/suspend`, { reason }),

    restore: (id: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${id}/restore`),

    forcePasswordReset: (id: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${id}/force-password-reset`),

    sendEmail: (id: string, data: { subject: string; body: string }): Promise<void> =>
      this.transport.post(`/api/admin/users/${id}/send-email`, data),

    delete: (id: string): Promise<void> =>
      this.transport.delete(`/api/admin/users/${id}`),

    invite: (data: { email: string; roleIds?: string[] }): Promise<void> =>
      this.transport.post('/api/users/invite', data),

    exportCsv: (filters?: UserFilters): Promise<Blob> =>
      this.transport.download('/api/admin/users/export', filters as Record<string, unknown>),
  };

  readonly sessions = {
    listForUser: (userId: string): Promise<Session[]> =>
      this.transport.get(`/api/admin/users/${userId}/sessions`),

    revoke: (sessionId: string): Promise<void> =>
      this.transport.delete(`/api/session/${sessionId}`),

    revokeAll: (userId: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${userId}/sessions/revoke-all`),

    revokeAllForUser: (userId: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${userId}/sessions/revoke-all`),
  };

  readonly roles = {
    list: (): Promise<Role[]> =>
      this.transport.get('/api/rbac/roles'),

    get: (id: string): Promise<RoleWithPolicies> =>
      this.transport.get(`/api/rbac/roles/${id}`),

    create: (data: CreateRoleDto): Promise<Role> =>
      this.transport.post('/api/rbac/roles', data),

    update: (id: string, data: UpdateRoleDto): Promise<Role> =>
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

    create: (data: CreatePolicyDto): Promise<Policy> =>
      this.transport.post('/api/rbac/policies', data),

    update: (id: string, data: UpdatePolicyDto): Promise<Policy> =>
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

    create: (data: CreateGroupDto): Promise<Group> =>
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

    create: (data: CreateClientDto): Promise<{ client: OAuthClient; clientSecret: string }> =>
      this.transport.post('/api/oauth/clients', data),

    update: (id: string, data: UpdateClientDto): Promise<OAuthClient> =>
      this.transport.patch(`/api/oauth/clients/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.transport.delete(`/api/oauth/clients/${id}`),

    rotate: (id: string): Promise<{ clientSecret: string }> =>
      this.transport.post(`/api/oauth/clients/${id}/rotate-secret`),

    rotateSecret: (id: string): Promise<{ clientSecret: string }> =>
      this.transport.post(`/api/oauth/clients/${id}/rotate-secret`),
  };

  readonly audit = {
    list: (filters?: AuditFilters): Promise<PaginatedResult<AuditEvent>> =>
      this.transport.get('/api/audit', filters as Record<string, unknown>),

    exportCsv: (filters?: AuditFilters): Promise<Blob> =>
      this.transport.download('/api/audit/export', filters as Record<string, unknown>),
  };

  readonly mfa = {
    getFactorsForUser: (userId: string): Promise<MfaFactor[]> =>
      this.transport.get(`/api/admin/users/${userId}/mfa-factors`),

    resetForUser: (userId: string): Promise<void> =>
      this.transport.post(`/api/admin/users/${userId}/mfa-reset`),

    initTotp: (): Promise<{ qrCodeDataUrl: string; manualEntryKey: string; backupCodes: string[] }> =>
      this.transport.post('/api/mfa/totp/setup'),

    verifyTotpSetup: (code: string): Promise<void> =>
      this.transport.post('/api/mfa/totp/verify-setup', { code }),

    getFactors: (): Promise<MfaFactor[]> =>
      this.transport.get('/api/mfa/factors'),

    deleteFactor: (factorId: string): Promise<void> =>
      this.transport.delete(`/api/mfa/factors/${factorId}`),

    regenerateBackupCodes: (): Promise<{ codes: string[] }> =>
      this.transport.post('/api/mfa/backup-codes/regenerate'),
  };

  readonly stats = {
    getDashboard: (): Promise<DashboardStats> =>
      this.transport.get('/api/admin/stats/dashboard'),

    getLoginActivity: (days: number): Promise<LoginActivityData> =>
      this.transport.get('/api/admin/stats/login-activity', { days }),
  };

  readonly workspaces = {
    list: (): Promise<WorkspaceMembership[]> =>
      this.transport.get('/api/user/workspaces'),
  };

  readonly tenant = {
    get: (): Promise<TenantDetail> =>
      this.transport.get('/api/tenant'),

    update: (data: Partial<TenantDetail> & { name?: string; primaryColor?: string }): Promise<TenantDetail> =>
      this.transport.patch('/api/tenant', data),

    getPasswordPolicy: (): Promise<PasswordPolicy> =>
      this.transport.get('/api/tenant/password-policy'),

    updatePasswordPolicy: (data: PasswordPolicy): Promise<PasswordPolicy> =>
      this.transport.patch('/api/tenant/password-policy', data),

    getBranding: (): Promise<TenantBranding> =>
      this.transport.get('/api/tenant/branding'),

    getMfaPolicy: (): Promise<TenantMfaPolicy> =>
      this.transport.get('/api/tenant/mfa-policy'),

    updateMfaPolicy: (data: TenantMfaPolicy): Promise<TenantMfaPolicy> =>
      this.transport.patch('/api/tenant/mfa-policy', data),

    uploadLogo: (file: File): Promise<{ url: string }> => {
      const form = new FormData();
      form.append('logo', file);
      return this.transport.upload('/api/tenant/logo', form);
    },

    delete: (confirmation: string): Promise<void> =>
      this.transport.post('/api/tenant/delete', { confirmation }),
  };

  getUserWorkspaces(): Promise<WorkspaceMembership[]> {
    return this.transport.get('/api/user/workspaces');
  }
}
