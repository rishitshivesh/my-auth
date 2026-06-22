export const Permissions = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  USERS_INVITE: 'users:invite',
  USERS_SUSPEND: 'users:suspend',
  USERS_EXPORT: 'users:export',
  USERS_IMPERSONATE: 'users:impersonate',

  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_DELETE: 'roles:delete',
  POLICIES_READ: 'policies:read',
  POLICIES_WRITE: 'policies:write',
  POLICIES_DELETE: 'policies:delete',
  POLICIES_SIMULATE: 'policies:simulate',
  GROUPS_READ: 'groups:read',
  GROUPS_WRITE: 'groups:write',
  GROUPS_DELETE: 'groups:delete',

  SESSIONS_READ: 'sessions:read',
  SESSIONS_REVOKE: 'sessions:revoke',
  SESSIONS_REVOKE_ALL: 'sessions:revoke_all',

  CLIENTS_READ: 'clients:read',
  CLIENTS_WRITE: 'clients:write',
  CLIENTS_DELETE: 'clients:delete',
  CLIENTS_ROTATE_SECRET: 'clients:rotate_secret',

  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  MFA_READ: 'mfa:read',
  MFA_ENFORCE: 'mfa:enforce',
  MFA_RESET_USER: 'mfa:reset_user',

  TENANT_READ: 'tenant:read',
  TENANT_WRITE: 'tenant:write',
  TENANT_DELETE: 'tenant:delete',
  TENANT_BILLING: 'tenant:billing',

  API_KEYS_READ: 'api_keys:read',
  API_KEYS_WRITE: 'api_keys:write',
  API_KEYS_DELETE: 'api_keys:delete',

  PERMISSIONS_READ: 'permissions:read',
  PERMISSIONS_WRITE: 'permissions:write',
} as const;

export type PermissionString = typeof Permissions[keyof typeof Permissions];
