"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, PageHeader, ResourceTable, SentryButton, type ResourceColumn } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { QueryKeys } from "@/constants/query-keys";
import { usePermission } from "@/hooks/use-permission";
import { accessApi } from "../api/access-api";
import { errorText, queryStatus } from "../api/error-text";
import { useAccessMutation, usePolicies } from "../api/use-access";
import { PolicyDetailPanel } from "../components/PolicyDetailPanel";
import { PolicyEditorDialog } from "../components/PolicyEditorDialog";
import { useTableLabels } from "../components/table-labels";
import { parsePolicyJson } from "../model/policy-document";
import type { PolicyFormValues } from "../model/policy-form";
import type { PolicyDto } from "../model/types";

type Dialog = { kind: "create" } | { kind: "edit" } | { kind: "delete" };

export function PoliciesView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can } = usePermission();
  const canWrite = can("policies:write");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const policies = usePolicies(slug);
  const selected = policies.data?.data.find((p) => p.id === selectedId) ?? null;
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (policies.data?.data ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle));
  }, [policies.data, search]);

  const affected = (k: QueryKeys) => [k.policies.all(), k.roles.all(), k.groups.all()];
  const create = useAccessMutation(slug, (v: PolicyFormValues) => {
    const parsed = parsePolicyJson(v.json);
    if (!parsed.ok) return Promise.reject(new Error(t("access.policies.issues.invalidJson")));
    return accessApi.createPolicy({ name: v.name.trim(), description: v.description.trim() || undefined, document: parsed.document, type: v.type });
  }, affected);
  const update = useAccessMutation(slug, (v: { id: string; values: PolicyFormValues }) => {
    const parsed = parsePolicyJson(v.values.json);
    if (!parsed.ok) return Promise.reject(new Error(t("access.policies.issues.invalidJson")));
    return accessApi.updatePolicy(v.id, { description: v.values.description.trim(), document: parsed.document });
  }, affected);
  const remove = useAccessMutation(slug, (id: string) => accessApi.deletePolicy(id), affected);

  const close = () => { setDialog(null); create.reset(); update.reset(); remove.reset(); };
  const run = (promise: Promise<unknown>, after?: () => void) => promise.then(() => { close(); after?.(); }, () => undefined);

  const labels = useTableLabels<PolicyDto>({
    base: "access.policies.table",
    rowName: (p) => p.name,
    pageStatus: t("common.labels.results", { count: rows.length }),
    onRetry: () => void policies.refetch(),
    onClear: () => setSearch(""),
    onCreate: canWrite ? () => setDialog({ kind: "create" }) : undefined,
  });
  const columns: ResourceColumn<PolicyDto>[] = [
    { header: t("access.policies.columns.name"), accessorKey: (p) => <span className="block break-words">{p.name}</span> },
    { header: t("access.policies.columns.type"), accessorKey: (p) => t(`access.policies.editor.types.${p.type}`) },
    { header: t("access.policies.columns.statements"), accessorKey: (p) => String(p.document.Statement.length) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("access.policies.title")}
        subtitle={t("access.policies.subtitle")}
        action={canWrite ? <SentryButton variant="primary" onClick={() => setDialog({ kind: "create" })}>{t("access.policies.create")}</SentryButton> : undefined}
      />
      <ResourceTable<PolicyDto>
        columns={columns}
        rows={rows}
        status={queryStatus(policies)}
        labels={labels}
        searchValue={search}
        onSearchChange={setSearch}
        isFiltered={search.trim() !== ""}
        isRefreshing={policies.isFetching}
        onRowClick={(p) => setSelectedId(p.id)}
        rowActions={(p) => [{ id: "open", label: t("access.roles.actions.open"), onSelect: () => setSelectedId(p.id) }]}
      />
      {selected && (
        <PolicyDetailPanel policy={selected} canWrite={canWrite} onEdit={() => setDialog({ kind: "edit" })} onDelete={() => setDialog({ kind: "delete" })} />
      )}
      <PolicyEditorDialog
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        onOpenChange={(open) => !open && close()}
        policy={dialog?.kind === "edit" ? (selected ?? undefined) : undefined}
        pending={create.isPending || update.isPending}
        error={errorText(dialog?.kind === "edit" ? update.error : create.error)}
        onSubmit={(values) => void (dialog?.kind === "edit" && selected ? run(update.mutateAsync({ id: selected.id, values })) : run(create.mutateAsync(values)))}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title={t("access.policies.delete.title")}
        description={t("access.policies.delete.description", { name: selected?.name ?? "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.policies.delete.effectAttachments"), t("access.roles.delete.effectIrreversible")]}
        confirmLabel={t("access.policies.delete.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={remove.isPending}
        error={errorText(remove.error)}
        onConfirm={() => { void (selected && run(remove.mutateAsync(selected.id), () => setSelectedId(null))); }}
      />
    </div>
  );
}
