"use client";

import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { isProtectedRole } from "../model/role-form";
import { roleLabel } from "../model/role-diff";
import type { PolicyDto, RoleDto } from "../model/types";

export interface RoleDetailPanelProps {
  role: RoleDto;
  policies: readonly PolicyDto[];
  policiesStatus: "loading" | "error" | "ready";
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddPermissions: () => void;
  onRemovePermission: (name: string) => void;
  onAttachPolicy: () => void;
  onDetachPolicy: (policy: PolicyDto) => void;
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-sm border border-border px-2 py-0.5 font-display text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

export function RoleDetailPanel({
  role, policies, policiesStatus, canWrite, onEdit, onDelete, onAddPermissions, onRemovePermission, onAttachPolicy,
  onDetachPolicy,
}: RoleDetailPanelProps) {
  const { t } = useCopy();
  const locked = isProtectedRole(role);
  const editable = canWrite && !locked;
  const links = (role.rolePermissions ?? []).flatMap((l) => (l.permission ? [l.permission] : []));

  return (
    <section aria-labelledby="role-detail-title" className="space-y-6 rounded-md border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="role-detail-title" className="break-words font-display text-lg font-semibold text-foreground">
            {roleLabel(role)}
          </h2>
          <p className="break-all font-mono text-xs text-muted-foreground">{role.name}</p>
          {role.description && <p className="break-words font-body text-sm text-muted-foreground">{role.description}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {role.isSystem && <Badge>{t("access.roles.badges.system")}</Badge>}
            {role.isDefault && <Badge>{t("access.roles.badges.default")}</Badge>}
            {!role.isActive && <Badge>{t("access.roles.badges.inactive")}</Badge>}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <SentryButton variant="outline" size="sm" disabled={locked} onClick={onEdit}>{t("access.roles.detail.edit")}</SentryButton>
            <SentryButton variant="destructive" size="sm" disabled={locked} onClick={onDelete}>{t("access.roles.detail.delete")}</SentryButton>
          </div>
        )}
      </header>
      {locked && <p role="note" className="font-body text-sm text-muted-foreground">{t("access.roles.detail.protected")}</p>}

      <section aria-labelledby="role-permissions-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="role-permissions-title" className="font-display text-sm font-semibold text-foreground">
            {t("access.roles.detail.permissions", { count: links.length })}
          </h3>
          {editable && (
            <SentryButton variant="outline" size="sm" onClick={onAddPermissions}>{t("access.roles.detail.addPermissions")}</SentryButton>
          )}
        </div>
        {links.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">{t("access.roles.detail.noPermissions")}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {links.map((permission) => (
              <li key={permission.id} className="flex items-center justify-between gap-3 p-2.5">
                <span className="min-w-0 break-all font-mono text-xs text-foreground">{permission.name}</span>
                {editable && (
                  <SentryButton
                    variant="ghost"
                    size="sm"
                    aria-label={t("access.roles.detail.removePermission", { name: permission.name })}
                    onClick={() => onRemovePermission(permission.name)}
                  >
                    {t("access.roles.detail.remove")}
                  </SentryButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="role-policies-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="role-policies-title" className="font-display text-sm font-semibold text-foreground">
            {t("access.roles.detail.policies")}
          </h3>
          {editable && (
            <SentryButton variant="outline" size="sm" onClick={onAttachPolicy}>{t("access.roles.detail.attachPolicy")}</SentryButton>
          )}
        </div>
        {policiesStatus === "loading" && <p role="status" className="font-body text-sm text-muted-foreground">{t("states.loading.title")}</p>}
        {policiesStatus === "error" && <p role="alert" className="font-body text-sm text-destructive">{t("access.roles.detail.policiesError")}</p>}
        {policiesStatus === "ready" && policies.length === 0 && (
          <p className="font-body text-sm text-muted-foreground">{t("access.roles.detail.noPolicies")}</p>
        )}
        {policiesStatus === "ready" && policies.length > 0 && (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {policies.map((policy) => (
              <li key={policy.id} className="flex items-center justify-between gap-3 p-2.5">
                <span className="min-w-0 break-words font-body text-sm text-foreground">{policy.name}</span>
                {editable && (
                  <SentryButton
                    variant="ghost"
                    size="sm"
                    aria-label={t("access.roles.detail.detachPolicy", { name: policy.name })}
                    onClick={() => onDetachPolicy(policy)}
                  >
                    {t("access.roles.detail.detach")}
                  </SentryButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
