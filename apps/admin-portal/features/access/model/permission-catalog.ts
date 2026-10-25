import type { PermissionDto } from "./types";

export interface PermissionGroup {
  resource: string;
  permissions: readonly PermissionDto[];
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const MAX_IDENTIFIER_LENGTH = 64;

export function permissionName(resource: string, action: string): string {
  return `${resource}:${action}`;
}

export function matchesQuery(permission: PermissionDto, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [permission.name, permission.description ?? ""].some((text) => text.toLowerCase().includes(needle));
}

/** Groups by resource (alphabetical), permissions alphabetical within a group. */
export function groupByResource(permissions: readonly PermissionDto[], query = ""): PermissionGroup[] {
  const byResource = new Map<string, PermissionDto[]>();
  for (const permission of permissions) {
    if (!matchesQuery(permission, query)) continue;
    const list = byResource.get(permission.resource) ?? [];
    byResource.set(permission.resource, [...list, permission]);
  }
  return [...byResource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, list]) => ({
      resource,
      permissions: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export type PermissionFormErrorCode = "required" | "format" | "tooLong";

export interface PermissionFormValues {
  resource: string;
  action: string;
  description: string;
}

export type PermissionFormErrors = Partial<Record<keyof PermissionFormValues, PermissionFormErrorCode>>;

function validateIdentifier(value: string): PermissionFormErrorCode | undefined {
  if (!value.trim()) return "required";
  if (value.length > MAX_IDENTIFIER_LENGTH) return "tooLong";
  if (!IDENTIFIER.test(value)) return "format";
  return undefined;
}

export function validatePermissionForm(values: PermissionFormValues): PermissionFormErrors {
  const errors: PermissionFormErrors = {};
  const resource = validateIdentifier(values.resource);
  const action = validateIdentifier(values.action);
  if (resource) errors.resource = resource;
  if (action) errors.action = action;
  return errors;
}

/** System permissions are read-only; the API enforces this too. */
export function isEditable(permission: PermissionDto): boolean {
  return !permission.isSystem;
}
