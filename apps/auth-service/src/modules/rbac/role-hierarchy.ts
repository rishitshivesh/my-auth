/**
 * Role hierarchy rules. Roles carry a numeric `priority`; "owner-level"
 * roles are those at or above ADMIN_ROLE_PRIORITY (admin, super_admin).
 */
export const ADMIN_ROLE_PRIORITY = 900;
export const SUPER_ADMIN_ROLE_PRIORITY = 1000;

export function maxPriority(priorities: readonly number[]): number {
  return priorities.reduce((max, p) => (p > max ? p : max), 0);
}

export function isOwnerLevel(priority: number): boolean {
  return priority >= ADMIN_ROLE_PRIORITY;
}

/**
 * An actor may manage a target (or hand out / revoke a role) only when strictly
 * above it; the top tier may manage its own tier.
 */
export function canManage(actorPriority: number, targetPriority: number): boolean {
  if (actorPriority >= SUPER_ADMIN_ROLE_PRIORITY) return true;
  return actorPriority > targetPriority;
}
