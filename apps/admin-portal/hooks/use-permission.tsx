"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hasAllPermissions, hasAnyPermission, hasPermission } from "@/lib/permissions";

interface PermissionState {
  granted: readonly string[];
  /** False until the grant list is known; gate UI as "unknown", not "denied". */
  isReady: boolean;
}

const PermissionContext = createContext<PermissionState>({ granted: [], isReady: false });

export function PermissionProvider({
  granted, isReady, children,
}: PermissionState & { children: ReactNode }) {
  const value = useMemo(() => ({ granted, isReady }), [granted, isReady]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/** UI gating only; the backend enforces every permission. */
export function usePermission() {
  const { granted, isReady } = useContext(PermissionContext);
  return useMemo(
    () => ({
      isReady,
      can: (permission: string) => hasPermission(granted, permission),
      canAny: (permissions: readonly string[]) => hasAnyPermission(granted, permissions),
      canAll: (permissions: readonly string[]) => hasAllPermissions(granted, permissions),
    }),
    [granted, isReady],
  );
}
