"use client";

import { type ReactNode } from "react";
import { useAuth } from "@scrolloop/sdk";
import { useSessionGate } from "../api/use-session-gate";
import { useSignOut } from "../api/use-sign-out";
import { SurfaceLoading } from "./SurfaceState";
import { PlatformConsoleShell } from "./PlatformConsoleShell";

/** Layout-level frame for platform operator routes: session guard plus the platform shell. */
export function PlatformConsoleFrame({ children }: { children: ReactNode }) {
  const gate = useSessionGate();
  const { user } = useAuth();
  const onSignOut = useSignOut();
  if (gate !== "signed-in") return <SurfaceLoading />;
  return (
    <PlatformConsoleShell identity={user?.email ?? ""} onSignOut={onSignOut}>
      {children}
    </PlatformConsoleShell>
  );
}
