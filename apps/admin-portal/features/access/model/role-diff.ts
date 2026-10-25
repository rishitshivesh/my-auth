import type { PermissionDto, RoleDto } from "./types";

export interface SelectionDiff {
  added: readonly string[];
  removed: readonly string[];
  unchanged: readonly string[];
}

/** Compares two sets of names (role names or permission names); order independent. */
export function diffSelection(current: readonly string[], next: readonly string[]): SelectionDiff {
  const before = new Set(current);
  const after = new Set(next);
  return {
    added: [...after].filter((name) => !before.has(name)).sort(),
    removed: [...before].filter((name) => !after.has(name)).sort(),
    unchanged: [...after].filter((name) => before.has(name)).sort(),
  };
}

export function hasChanges(diff: SelectionDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0;
}

/** Permission names granted by a set of roles, de-duplicated and sorted. */
export function permissionNamesOf(roles: readonly RoleDto[]): string[] {
  const names = new Set<string>();
  for (const role of roles) {
    for (const link of role.rolePermissions ?? []) {
      if (link.permission) names.add(link.permission.name);
    }
  }
  return [...names].sort();
}

export interface AccessImpact {
  gained: readonly string[];
  lost: readonly string[];
}

/**
 * What changes in effective permissions when a person moves from `currentRoles`
 * to `nextRoles`. Roles must be loaded with their permissions; a role without
 * `rolePermissions` contributes nothing, so callers show the preview as "known
 * permissions" rather than a guarantee.
 */
export function accessImpact(currentRoles: readonly RoleDto[], nextRoles: readonly RoleDto[]): AccessImpact {
  const diff = diffSelection(permissionNamesOf(currentRoles), permissionNamesOf(nextRoles));
  return { gained: diff.added, lost: diff.removed };
}

export function resolveRoles(allRoles: readonly RoleDto[], names: readonly string[]): RoleDto[] {
  const wanted = new Set(names);
  return allRoles.filter((role) => wanted.has(role.name));
}

export function roleLabel(role: Pick<RoleDto, "name" | "displayName">): string {
  return role.displayName?.trim() || role.name;
}

/** Keeps only permissions that are not yet part of the role. */
export function assignablePermissions(all: readonly PermissionDto[], role: RoleDto): PermissionDto[] {
  const held = new Set((role.rolePermissions ?? []).map((l) => l.permission?.name));
  return all.filter((p) => !held.has(p.name));
}
