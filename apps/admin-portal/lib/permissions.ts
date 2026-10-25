/**
 * UI-gating helpers only. They decide what to SHOW; the backend remains the
 * sole authority and every request is still authorised server-side.
 */

function matches(granted: string, required: string): boolean {
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(":*")) return required.startsWith(granted.slice(0, -1));
  return false;
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.some((g) => matches(g, required));
}

export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((r) => hasPermission(granted, r));
}

export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((r) => hasPermission(granted, r));
}
