"use client";

import { accessApi } from "./access-api";
import { useAccessMutation } from "./use-access";
import type { RoleFormValues } from "../model/role-form";

/** Every write the roles screen performs; each invalidates the scoped keys it affects. */
export function useRoleActions(slug: string) {
  const create = useAccessMutation(
    slug,
    (vars: { values: RoleFormValues; permissionNames: string[] }) =>
      accessApi.createRole({
        name: vars.values.name.trim(),
        displayName: vars.values.displayName.trim() || undefined,
        description: vars.values.description.trim() || undefined,
        permissionNames: vars.permissionNames.length > 0 ? vars.permissionNames : undefined,
      }),
    (k) => [k.roles.all()],
  );
  const update = useAccessMutation(
    slug,
    (vars: { id: string; values: RoleFormValues }) =>
      accessApi.updateRole(vars.id, {
        displayName: vars.values.displayName.trim() || undefined,
        description: vars.values.description.trim() || undefined,
      }),
    (k) => [k.roles.all()],
  );
  const remove = useAccessMutation(slug, (id: string) => accessApi.deleteRole(id), (k) => [k.roles.all(), k.users.all()]);
  const addPermissions = useAccessMutation(
    slug,
    (vars: { id: string; names: string[] }) => accessApi.addRolePermissions(vars.id, vars.names),
    (k) => [k.roles.all(), k.users.all()],
  );
  const removePermission = useAccessMutation(
    slug,
    (vars: { id: string; name: string }) => accessApi.removeRolePermissions(vars.id, [vars.name]),
    (k) => [k.roles.all(), k.users.all()],
  );
  const attachPolicies = useAccessMutation(
    slug,
    async (vars: { id: string; policyIds: string[] }) => {
      for (const policyId of vars.policyIds) await accessApi.attachRolePolicy(vars.id, policyId);
    },
    (k) => [k.roles.all()],
  );
  const detachPolicy = useAccessMutation(
    slug,
    (vars: { id: string; policyId: string }) => accessApi.detachRolePolicy(vars.id, vars.policyId),
    (k) => [k.roles.all()],
  );
  return { create, update, remove, addPermissions, removePermission, attachPolicies, detachPolicy };
}
