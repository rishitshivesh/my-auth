"use client";

import { useAuth } from "@scrolloop/sdk";
import { useMyPermissions, useMyRoles } from "@/lib/queries";
import { grantedPermissions } from "../model/permission-grants";

export interface GrantedPermissions {
  granted: readonly string[];
  /** True once the grant list is known. A failed lookup stays "unknown" so the UI never over-hides. */
  isReady: boolean;
}

/** The signed-in user's effective permission names, for UI gating only. */
export function useGrantedPermissions(): GrantedPermissions {
  const { user } = useAuth();
  const permissions = useMyPermissions(Boolean(user?.id));
  const roles = useMyRoles(Boolean(user?.id));
  if (!permissions.isSuccess || !roles.isSuccess) return { granted: [], isReady: false };
  const attached = permissions.data.map((permission) => permission.name);
  return { granted: grantedPermissions(roles.data, attached), isReady: true };
}
