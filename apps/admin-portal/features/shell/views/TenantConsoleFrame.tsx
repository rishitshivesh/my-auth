"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSession } from "@scrolloop/sdk";
import { tenantRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { PermissionProvider } from "@/hooks/use-permission";
import { useGrantedPermissions } from "../api/use-granted-permissions";
import { useSessionGate } from "../api/use-session-gate";
import { useSignOut } from "../api/use-sign-out";
import { SurfaceLoading, SurfaceState } from "./SurfaceState";
import { TenantConsoleShell } from "./TenantConsoleShell";

/**
 * Layout-level frame for /t/[slug]: session guard, tenant-mismatch handling,
 * permission context and the tenant console shell. Mounted once by the layout.
 */
export function TenantConsoleFrame({ slug, children }: { slug: string; children: ReactNode }) {
  const { t } = useCopy();
  const router = useRouter();
  const gate = useSessionGate();
  const { user } = useAuth();
  const { session } = useSession();
  const permissions = useGrantedPermissions();
  const onSignOut = useSignOut(slug);

  if (gate !== "signed-in") return <SurfaceLoading />;

  const ownSlug = session?.tenantSlug;
  if (ownSlug && ownSlug !== slug) {
    return (
      <SurfaceState
        kind="denied"
        title={t("tenant.shell.mismatch.title")}
        description={t("tenant.shell.mismatch.description")}
        action={{ label: t("tenant.shell.mismatch.action"), onClick: () => router.replace(tenantRoutes(ownSlug).dashboard()) }}
      />
    );
  }

  return (
    <PermissionProvider granted={permissions.granted} isReady={permissions.isReady}>
      <TenantConsoleShell slug={slug} identity={user?.email ?? ""} onSignOut={onSignOut}>
        {children}
      </TenantConsoleShell>
    </PermissionProvider>
  );
}
