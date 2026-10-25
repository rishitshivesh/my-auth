export interface RoleFormValues {
  name: string;
  displayName: string;
  description: string;
}

export type RoleFormErrorCode = "required" | "format" | "tooLong";
export type RoleFormErrors = Partial<Record<keyof RoleFormValues, RoleFormErrorCode>>;

const ROLE_NAME = /^[a-z][a-z0-9_-]*$/;
const NAME_MAX = 64;
const TEXT_MAX = 255;

export function validateRoleForm(values: RoleFormValues, mode: "create" | "edit"): RoleFormErrors {
  const errors: RoleFormErrors = {};
  if (mode === "create") {
    const name = values.name.trim();
    if (!name) errors.name = "required";
    else if (name.length > NAME_MAX) errors.name = "tooLong";
    else if (!ROLE_NAME.test(name)) errors.name = "format";
  }
  if (values.displayName.trim().length > NAME_MAX) errors.displayName = "tooLong";
  if (values.description.trim().length > TEXT_MAX) errors.description = "tooLong";
  return errors;
}

/** A role that can still be edited, deleted or have permissions changed. */
export function isProtectedRole(role: { isSystem: boolean }): boolean {
  return role.isSystem;
}
