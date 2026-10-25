"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, PageHeader, ResourceTable, SentryButton, type ResourceColumn } from "@repo/ui";
import { useCopy } from "@/i18n";
import { usePermission } from "@/hooks/use-permission";
import { errorText, queryStatus } from "../api/error-text";
import { useRolePolicies, useRoles, usePermissionCatalog, usePolicies } from "../api/use-access";
import { useRoleActions } from "../api/use-role-actions";
import { PickerDialog } from "../components/PickerDialog";
import { RoleDetailPanel } from "../components/RoleDetailPanel";
import { RoleFormDialog } from "../components/RoleFormDialog";
import { useTableLabels } from "../components/table-labels";
import { assignablePermissions, roleLabel } from "../model/role-diff";
import type { PolicyDto, RoleDto } from "../model/types";

type Dialog =
  | { kind: "create" } | { kind: "edit" } | { kind: "delete" } | { kind: "addPermissions" }
  | { kind: "attachPolicy" } | { kind: "removePermission"; name: string } | { kind: "detachPolicy"; policy: PolicyDto };

export function RolesView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can } = usePermission();
  const canWrite = can("roles:write");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const roles = useRoles(slug);
  const catalog = usePermissionCatalog(slug, dialog?.kind === "create" || dialog?.kind === "addPermissions");
  const allPolicies = usePolicies(slug, dialog?.kind === "attachPolicy");
  const selected = roles.data?.find((r) => r.id === selectedId) ?? null;
  const attached = useRolePolicies(slug, selected?.id ?? null);
  const actions = useRoleActions(slug);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (roles.data ?? []).filter((r) => !needle || `${r.name} ${r.displayName ?? ""}`.toLowerCase().includes(needle));
  }, [roles.data, search]);

  const close = () => {
    setDialog(null);
    Object.values(actions).forEach((m) => m.reset());
  };
  const labels = useTableLabels<RoleDto>({
    base: "access.roles.table",
    rowName: roleLabel,
    pageStatus: t("common.labels.results", { count: rows.length }),
    onRetry: () => void roles.refetch(),
    onClear: () => setSearch(""),
    onCreate: canWrite ? () => setDialog({ kind: "create" }) : undefined,
  });

  const columns: ResourceColumn<RoleDto>[] = [
    {
      header: t("access.roles.columns.role"),
      accessorKey: (r) => (
        <span className="block min-w-0">
          <span className="block break-words font-body text-sm text-foreground">{roleLabel(r)}</span>
          <span className="block break-all font-mono text-xs text-muted-foreground">{r.name}</span>
        </span>
      ),
    },
    { header: t("access.roles.columns.type"), accessorKey: (r) => t(r.isSystem ? "access.roles.badges.system" : "access.roles.badges.custom") },
    { header: t("access.roles.columns.permissions"), accessorKey: (r) => String(r.rolePermissions?.length ?? 0) },
  ];

  const mutationError = (m: { error: unknown }) => errorText(m.error);
  const run = (promise: Promise<unknown>, after?: () => void) => promise.then(() => { close(); after?.(); }, () => undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("access.roles.title")}
        subtitle={t("access.roles.subtitle")}
        action={canWrite ? <SentryButton variant="primary" onClick={() => setDialog({ kind: "create" })}>{t("access.roles.create")}</SentryButton> : undefined}
      />
      <ResourceTable<RoleDto>
        columns={columns}
        rows={rows}
        status={queryStatus(roles)}
        labels={labels}
        searchValue={search}
        onSearchChange={setSearch}
        isFiltered={search.trim() !== ""}
        isRefreshing={roles.isFetching}
        onRowClick={(r) => setSelectedId(r.id)}
        rowActions={(r) => [{ id: "open", label: t("access.roles.actions.open"), onSelect: () => setSelectedId(r.id) }]}
      />
      {selected && (
        <RoleDetailPanel
          role={selected}
          policies={attached.data ?? []}
          policiesStatus={attached.isPending ? "loading" : attached.isError ? "error" : "ready"}
          canWrite={canWrite}
          onEdit={() => setDialog({ kind: "edit" })}
          onDelete={() => setDialog({ kind: "delete" })}
          onAddPermissions={() => setDialog({ kind: "addPermissions" })}
          onRemovePermission={(name) => setDialog({ kind: "removePermission", name })}
          onAttachPolicy={() => setDialog({ kind: "attachPolicy" })}
          onDetachPolicy={(policy) => setDialog({ kind: "detachPolicy", policy })}
        />
      )}

      <RoleFormDialog
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        onOpenChange={(open) => !open && close()}
        role={dialog?.kind === "edit" ? (selected ?? undefined) : undefined}
        permissions={catalog.data ?? []}
        pending={actions.create.isPending || actions.update.isPending}
        error={mutationError(dialog?.kind === "edit" ? actions.update : actions.create)}
        onSubmit={(submit) =>
          dialog?.kind === "edit" && selected
            ? void run(actions.update.mutateAsync({ id: selected.id, values: submit.values }))
            : void run(actions.create.mutateAsync(submit), undefined)
        }
      />
      <PickerDialog
        open={dialog?.kind === "addPermissions"}
        onOpenChange={(open) => !open && close()}
        title={t("access.roles.addPermissions.title")}
        description={t("access.roles.addPermissions.description")}
        legend={t("access.roles.addPermissions.legend")}
        items={selected ? assignablePermissions(catalog.data ?? [], selected).map((p) => ({ id: p.name, label: p.name, description: p.description ?? undefined })) : []}
        emptyText={t("access.roles.addPermissions.empty")}
        confirmLabel={t("access.roles.addPermissions.confirm")}
        pending={actions.addPermissions.isPending}
        error={mutationError(actions.addPermissions)}
        onConfirm={(names) => selected && void run(actions.addPermissions.mutateAsync({ id: selected.id, names }))}
      />
      <PickerDialog
        open={dialog?.kind === "attachPolicy"}
        onOpenChange={(open) => !open && close()}
        title={t("access.roles.attachPolicy.title")}
        description={t("access.roles.attachPolicy.description")}
        legend={t("access.roles.attachPolicy.legend")}
        items={(allPolicies.data?.data ?? [])
          .filter((p) => !(attached.data ?? []).some((a) => a.id === p.id))
          .map((p) => ({ id: p.id, label: p.name, description: p.description ?? undefined }))}
        emptyText={t("access.roles.attachPolicy.empty")}
        confirmLabel={t("access.roles.attachPolicy.confirm")}
        pending={actions.attachPolicies.isPending}
        error={mutationError(actions.attachPolicies)}
        onConfirm={(policyIds) => selected && void run(actions.attachPolicies.mutateAsync({ id: selected.id, policyIds }))}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title={t("access.roles.delete.title")}
        description={t("access.roles.delete.description", { name: selected ? roleLabel(selected) : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.roles.delete.effectAccess"), t("access.roles.delete.effectIrreversible")]}
        confirmLabel={t("access.roles.delete.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        confirmPhrase={selected?.name}
        confirmPhraseLabel={selected ? t("common.dialog.typeToConfirm", { phrase: selected.name }) : undefined}
        pending={actions.remove.isPending}
        error={mutationError(actions.remove)}
        onConfirm={() => { void (selected && run(actions.remove.mutateAsync(selected.id), () => setSelectedId(null))); }}
      />
      <ConfirmDialog
        open={dialog?.kind === "removePermission"}
        onOpenChange={(open) => !open && close()}
        title={t("access.roles.removePermission.title")}
        description={t("access.roles.removePermission.description", { name: dialog?.kind === "removePermission" ? dialog.name : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.roles.removePermission.effect")]}
        confirmLabel={t("access.roles.removePermission.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={actions.removePermission.isPending}
        error={mutationError(actions.removePermission)}
        onConfirm={() => { void (selected && dialog?.kind === "removePermission" && run(actions.removePermission.mutateAsync({ id: selected.id, name: dialog.name }))); }}
      />
      <ConfirmDialog
        open={dialog?.kind === "detachPolicy"}
        onOpenChange={(open) => !open && close()}
        title={t("access.roles.detachPolicy.title")}
        description={t("access.roles.detachPolicy.description", { name: dialog?.kind === "detachPolicy" ? dialog.policy.name : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.roles.detachPolicy.effect")]}
        confirmLabel={t("access.roles.detachPolicy.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={actions.detachPolicy.isPending}
        error={mutationError(actions.detachPolicy)}
        onConfirm={() => { void (selected && dialog?.kind === "detachPolicy" && run(actions.detachPolicy.mutateAsync({ id: selected.id, policyId: dialog.policy.id }))); }}
      />
    </div>
  );
}
