"use client";

import { useAuth } from "@scrolloop/sdk";
import { useUserEffectivePermissions } from "@/lib/queries";

export interface GrantedPermissions {
  granted: readonly string[];
  /** True once the grant list is known. A failed lookup stays "unknown" so the UI never over-hides. */
  isReady: boolean;
}

/** The signed-in user's effective permission names, for UI gating only. */
export function useGrantedPermissions(): GrantedPermissions {
  const { user } = useAuth();
  const query = useUserEffectivePermissions(user?.id ?? "");
  if (!query.isSuccess) return { granted: [], isReady: false };
  return { granted: query.data.map((permission) => permission.name), isReady: true };
}
