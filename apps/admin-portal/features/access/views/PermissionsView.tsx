"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, PageHeader, SentryButton, StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { QueryKeys } from "@/constants/query-keys";
import { usePermission } from "@/hooks/use-permission";
import { accessApi } from "../api/access-api";
import { errorText, queryStatus } from "../api/error-text";
import { useAccessMutation, usePermissionCatalog } from "../api/use-access";
import { PermissionFormDialog } from "../components/PermissionFormDialog";
import { groupByResource, isEditable, permissionName, type PermissionFormValues } from "../model/permission-catalog";
import type { PermissionDto } from "../model/types";

type Dialog = { kind: "create" } | { kind: "edit"; permission: PermissionDto } | { kind: "delete"; permission: PermissionDto };

export function PermissionsView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can } = usePermission();
  const canWrite = can("permissions:write");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const catalog = usePermissionCatalog(slug);
  const status = queryStatus(catalog);
  const groups = useMemo(() => groupByResource(catalog.data ?? [], query), [catalog.data, query]);
  const affected = (k: QueryKeys) => [k.permissions.all(), k.roles.all()];

  const create = useAccessMutation(slug, (v: PermissionFormValues) =>
    accessApi.createPermission({
      name: permissionName(v.resource.trim(), v.action.trim()),
      resource: v.resource.trim(),
      action: v.action.trim(),
      description: v.description.trim() || undefined,
    }), affected);
  const update = useAccessMutation(slug, (v: { id: string; description: string }) =>
    accessApi.updatePermission(v.id, { description: v.description.trim() }), affected);
  const remove = useAccessMutation(slug, (id: string) => accessApi.deletePermission(id), affected);

  const close = () => { setDialog(null); create.reset(); update.reset(); remove.reset(); };
  const run = (promise: Promise<unknown>) => promise.then(close, () => undefined);
  const total = catalog.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("access.permissions.title")}
        subtitle={t("access.permissions.subtitle")}
        action={canWrite ? <SentryButton variant="primary" onClick={() => setDialog({ kind: "create" })}>{t("access.permissions.create")}</SentryButton> : undefined}
      />
      <div role="search" className="max-w-md">
        <label htmlFor="permission-search" className="mb-1.5 block font-display text-[13px] font-medium text-foreground">
          {t("access.permissions.table.searchLabel")}
        </label>
        <input
          id="permission-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("access.permissions.table.searchPlaceholder")}
          className="h-[42px] w-full rounded-sm border border-border bg-muted px-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <p aria-live="polite" className="font-body text-sm text-muted-foreground">
        {status === "ready" ? t("common.labels.results", { count: groups.reduce((n, g) => n + g.permissions.length, 0) }) : ""}
      </p>
      {status === "loading" && <StateView kind="loading" title={t("states.loading.title")} />}
      {status === "denied" && <StateView kind="denied" title={t("states.denied.title")} description={t("states.denied.description")} />}
      {status === "error" && (
        <StateView kind="error" title={t("states.error.title")} description={t("states.error.description")} action={{ label: t("common.actions.retry"), onClick: () => void catalog.refetch() }} />
      )}
      {status === "ready" && total === 0 && (
        <StateView kind="empty" title={t("access.permissions.table.emptyTitle")} description={t("access.permissions.table.emptyDescription")} />
      )}
      {status === "ready" && total > 0 && groups.length === 0 && (
        <StateView kind="filtered-empty" title={t("states.filteredEmpty.title")} description={t("states.filteredEmpty.description")} action={{ label: t("common.actions.clearFilters"), onClick: () => setQuery("") }} />
      )}
      {status === "ready" && groups.map((group) => (
        <section key={group.resource} aria-labelledby={`perm-${group.resource}`} className="space-y-2">
          <h2 id={`perm-${group.resource}`} className="font-display text-sm font-semibold text-foreground">{group.resource}</h2>
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {group.permissions.map((permission) => (
              <li key={permission.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm text-foreground">{permission.name}</p>
                  {permission.description && <p className="break-words font-body text-xs text-muted-foreground">{permission.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {permission.isSystem && (
                    <span className="rounded-sm border border-border px-2 py-0.5 font-display text-xs font-semibold text-muted-foreground">{t("access.roles.badges.system")}</span>
                  )}
                  {canWrite && isEditable(permission) && (
                    <>
                      <SentryButton variant="outline" size="sm" aria-label={t("access.permissions.editFor", { name: permission.name })} onClick={() => setDialog({ kind: "edit", permission })}>{t("access.roles.detail.edit")}</SentryButton>
                      <SentryButton variant="ghost" size="sm" aria-label={t("access.permissions.deleteFor", { name: permission.name })} onClick={() => setDialog({ kind: "delete", permission })}>{t("access.roles.detail.delete")}</SentryButton>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <PermissionFormDialog
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        onOpenChange={(open) => !open && close()}
        permission={dialog?.kind === "edit" ? dialog.permission : undefined}
        pending={create.isPending || update.isPending}
        error={errorText(dialog?.kind === "edit" ? update.error : create.error)}
        onSubmit={(values) =>
          void run(dialog?.kind === "edit" ? update.mutateAsync({ id: dialog.permission.id, description: values.description }) : create.mutateAsync(values))
        }
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title={t("access.permissions.delete.title")}
        description={t("access.permissions.delete.description", { name: dialog?.kind === "delete" ? dialog.permission.name : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.permissions.delete.effectRoles"), t("access.roles.delete.effectIrreversible")]}
        confirmLabel={t("access.permissions.delete.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={remove.isPending}
        error={errorText(remove.error)}
        onConfirm={() => { void (dialog?.kind === "delete" && run(remove.mutateAsync(dialog.permission.id))); }}
      />
    </div>
  );
}
