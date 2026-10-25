/**
 * What the console should treat as granted, for hiding and disabling UI only.
 *
 * System owner/admin roles carry their authority through IAM policies (`sentry:tenant:*:*`), so
 * `GET /rbac/users/:id/permissions` (role-attached permissions) is empty for them. Without this
 * the console would hide every screen from the people who run the workspace. The backend still
 * authorises every request.
 */
export const FULL_ACCESS_ROLES: readonly string[] = ["owner", "admin"];
export const WILDCARD_PERMISSION = "*";

export interface RoleLike {
  name: string;
  isSystem?: boolean;
}

export function grantedPermissions(roles: readonly RoleLike[], roleAttached: readonly string[]): readonly string[] {
  const fullAccess = roles.some((role) => role.isSystem !== false && FULL_ACCESS_ROLES.includes(role.name.toLowerCase()));
  return fullAccess ? [WILDCARD_PERMISSION] : roleAttached;
}
