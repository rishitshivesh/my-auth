export const SystemRoles = {
  OWNER: {
    name: 'Owner',
    slug: 'owner',
    description: 'Full control over the workspace. Cannot be removed by other roles.',
    isSystem: true,
    priority: 100,
    policy: {
      Version: '2024-01-01',
      Statement: [
        {
          Sid: 'OwnerFullAccess',
          Effect: 'Allow' as const,
          Action: ['*'],
          Resource: ['sentry:tenant:*:*'],
        },
      ],
    },
  },

  ADMIN: {
    name: 'Admin',
    slug: 'admin',
    description: 'Full access except billing and tenant deletion.',
    isSystem: true,
    priority: 80,
    policy: {
      Version: '2024-01-01',
      Statement: [
        {
          Sid: 'AdminAllow',
          Effect: 'Allow' as const,
          Action: [
            'users:*', 'roles:*', 'policies:*', 'groups:*',
            'sessions:*', 'clients:*', 'audit:*', 'mfa:*',
            'tenant:read', 'tenant:write',
            'api_keys:*', 'permissions:*',
          ],
          Resource: ['sentry:tenant:*:*'],
        },
        {
          Sid: 'AdminDenyDangerous',
          Effect: 'Deny' as const,
          Action: ['tenant:delete', 'tenant:billing', 'users:impersonate'],
          Resource: ['sentry:tenant:*:*'],
        },
      ],
    },
  },

  MEMBER: {
    name: 'Member',
    slug: 'member',
    description: 'Read-only access. Can manage own profile and sessions.',
    isSystem: true,
    priority: 10,
    policy: {
      Version: '2024-01-01',
      Statement: [
        {
          Sid: 'MemberReadOnly',
          Effect: 'Allow' as const,
          Action: [
            'users:read',
            'roles:read',
            'sessions:read',
            'sessions:revoke',
            'audit:read',
          ],
          Resource: [
            'sentry:tenant:*:user:${sentry:UserId}',
            'sentry:tenant:*:session:${sentry:UserId}:*',
            'sentry:tenant:*:audit:*',
            'sentry:tenant:*:role:*',
          ],
        },
      ],
    },
  },
} as const;
