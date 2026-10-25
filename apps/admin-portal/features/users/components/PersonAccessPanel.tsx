"use client";

import { SentryButton, StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { PermissionList } from "@/features/access/components/PermissionList";
import { roleLabel } from "@/features/access/model/role-diff";
import type { PermissionDto, RoleDto } from "@/features/access/model/types";

export interface PersonAccessPanelProps {
  roles: readonly RoleDto[];
  permissions: readonly PermissionDto[];
  status: "loading" | "error" | "ready";
  canWrite: boolean;
  onAssign: () => void;
  onRevoke: (role: RoleDto) => void;
  onRetry: () => void;
}

export function PersonAccessPanel({ roles, permissions, status, canWrite, onAssign, onRevoke, onRetry }: PersonAccessPanelProps) {
  const { t } = useCopy();
  if (status === "loading") return <StateView kind="loading" title={t("states.loading.title")} />;
  if (status === "error") {
    return <StateView kind="error" title={t("states.error.title")} description={t("states.error.description")} action={{ label: t("common.actions.retry"), onClick: onRetry }} />;
  }
  return (
    <div className="space-y-8">
      <section aria-labelledby="person-roles-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="person-roles-title" className="font-display text-base font-semibold text-foreground">{t("users.roles.title")}</h3>
          {canWrite && <SentryButton variant="outline" size="sm" onClick={onAssign}>{t("users.roles.assignButton")}</SentryButton>}
        </div>
        {roles.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">{t("users.roles.none")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {roles.map((role) => (
              <li key={role.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block break-words font-body text-sm text-foreground">{roleLabel(role)}</span>
                  <span className="block break-all font-mono text-xs text-muted-foreground">{role.name}</span>
                </span>
                {canWrite && (
                  <SentryButton variant="ghost" size="sm" aria-label={t("users.roles.revokeFor", { name: roleLabel(role) })} onClick={() => onRevoke(role)}>
                    {t("users.roles.revoke")}
                  </SentryButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="person-effective-title" className="space-y-3">
        <h3 id="person-effective-title" className="font-display text-base font-semibold text-foreground">{t("users.roles.effectiveTitle")}</h3>
        <p className="font-body text-sm text-muted-foreground">{t("users.roles.effectiveHint")}</p>
        <PermissionList permissions={permissions} label={t("users.roles.effectiveTitle")} emptyText={t("users.roles.noEffective")} />
      </section>
    </div>
  );
}
