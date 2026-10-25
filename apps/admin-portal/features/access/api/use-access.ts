"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { accessApi } from "./access-api";
import { useScopedKeys } from "./use-scope";

/** Reads for the access console. Keys are scoped to workspace + principal. */
export function useRoles(slug: string, enabled = true) {
  const keys = useScopedKeys(slug);
  return useQuery({ queryKey: keys.roles.list({ withPermissions: true }), queryFn: () => accessApi.roles(true), enabled });
}

export function useRolePolicies(slug: string, roleId: string | null) {
  const keys = useScopedKeys(slug);
  return useQuery({
    queryKey: keys.roles.custom(roleId, "policies"),
    queryFn: () => accessApi.rolePolicies(roleId as string),
    enabled: roleId !== null,
  });
}

export function usePermissionCatalog(slug: string, enabled = true) {
  const keys = useScopedKeys(slug);
  return useQuery({ queryKey: keys.permissions.list(), queryFn: accessApi.permissions, enabled });
}

export function usePolicies(slug: string, enabled = true) {
  const keys = useScopedKeys(slug);
  return useQuery({ queryKey: keys.policies.list(), queryFn: accessApi.policies, enabled });
}

export function useGroups(slug: string, enabled = true) {
  const keys = useScopedKeys(slug);
  return useQuery({ queryKey: keys.groups.list(), queryFn: accessApi.groups, enabled });
}

export function useGroupDetail(slug: string, groupId: string | null) {
  const keys = useScopedKeys(slug);
  return useQuery({
    queryKey: keys.groups.detail(groupId ?? ""),
    queryFn: () => accessApi.group(groupId as string),
    enabled: groupId !== null,
  });
}

export function useUserAccess(slug: string, userId: string) {
  const keys = useScopedKeys(slug);
  const roles = useQuery({ queryKey: keys.users.custom(userId, "roles"), queryFn: () => accessApi.userRoles(userId) });
  const permissions = useQuery({
    queryKey: keys.users.custom(userId, "permissions"),
    queryFn: () => accessApi.userPermissions(userId),
  });
  return { roles, permissions };
}

/**
 * Runs a write, then invalidates the given scoped keys. Errors propagate to the
 * caller (the dialog), which renders them inline; nothing is toasted as success.
 */
export function useAccessMutation<TVars, TResult>(
  slug: string,
  run: (vars: TVars) => Promise<TResult>,
  affected: (keys: ReturnType<typeof useScopedKeys>, vars: TVars) => QueryKey[],
) {
  const keys = useScopedKeys(slug);
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (_result, vars) => {
      await Promise.all(affected(keys, vars).map((queryKey) => client.invalidateQueries({ queryKey })));
    },
  });
}

export function useSimulation() {
  return useMutation({ mutationFn: accessApi.simulate });
}
