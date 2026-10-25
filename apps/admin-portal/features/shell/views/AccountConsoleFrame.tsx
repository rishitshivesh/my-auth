"use client";

import { type ReactNode } from "react";
import { useAuth, useSession } from "@scrolloop/sdk";
import { tenantRoutes } from "@/constants/routes";
import { StepUpProvider } from "@/features/account/api/step-up-context";
import { useSessionGate } from "../api/use-session-gate";
import { useSignOut } from "../api/use-sign-out";
import { SurfaceLoading } from "./SurfaceState";
import { AccountShell } from "./AccountShell";

/**
 * Layout-level frame for the personal account: session guard, account shell and
 * the shared recent-sign-in (step-up) context, mounted once for every account page.
 */
export function AccountConsoleFrame({ children }: { children: ReactNode }) {
  const gate = useSessionGate();
  const { user } = useAuth();
  const { session } = useSession();
  const onSignOut = useSignOut();
  if (gate !== "signed-in") return <SurfaceLoading />;
  return (
    <AccountShell
      identity={user?.displayName || user?.email || ""}
      onSignOut={onSignOut}
      workspaceHref={session?.tenantSlug ? tenantRoutes(session.tenantSlug).dashboard() : undefined}
    >
      <StepUpProvider>{children}</StepUpProvider>
    </AccountShell>
  );
}
