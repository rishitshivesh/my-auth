"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, PageHeader, ResourceTable, SentryButton, type ResourceColumn } from "@repo/ui";
import type { QueryKeys } from "@/constants/query-keys";
import { useCopy } from "@/i18n";
import { usePermission } from "@/hooks/use-permission";
import { useUserDirectory } from "@/features/users/api/use-users";
import { personName } from "@/features/users/model/person";
import { accessApi } from "../api/access-api";
import { errorText, queryStatus } from "../api/error-text";
import { useAccessMutation, useGroupDetail, useGroups, usePolicies } from "../api/use-access";
import { GroupDetailPanel, type GroupMemberRow } from "../components/GroupDetailPanel";
import { GroupFormDialog } from "../components/GroupFormDialog";
import { PickerDialog } from "../components/PickerDialog";
import { TextField } from "../components/TextField";
import { useTableLabels } from "../components/table-labels";
import { NO_PARENT, type GroupFormValues } from "../model/group-form";
import { flattenGroups, type GroupNode } from "../model/group-tree";

const INDENT = ["ps-0", "ps-4", "ps-8", "ps-12", "ps-16"] as const;

type Row = GroupNode & { id: string };
type Dialog =
  | { kind: "create" } | { kind: "edit" } | { kind: "delete" } | { kind: "addMembers" } | { kind: "attachPolicy" }
  | { kind: "removeMember"; member: GroupMemberRow } | { kind: "detachPolicy"; policyId: string; name: string };

export function GroupsView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can } = usePermission();
  const canWrite = can("groups:write");
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const groups = useGroups(slug);
  const detail = useGroupDetail(slug, selectedId);
  const directory = useUserDirectory(slug, dialog?.kind === "addMembers" ? memberSearch : "");
  const roster = useUserDirectory(slug, "", selectedId !== null);
  const policies = usePolicies(slug, dialog?.kind === "attachPolicy");

  const rows: Row[] = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return flattenGroups(groups.data ?? [])
      .filter((n) => !needle || n.group.name.toLowerCase().includes(needle))
      .map((n) => ({ ...n, id: n.group.id }));
  }, [groups.data, search]);

  const memberRows: GroupMemberRow[] = useMemo(() => {
    const byId = new Map((roster.data?.users ?? []).map((u) => [u.id, personName(u)]));
    return (detail.data?.members ?? []).map((m) => ({ userId: m.userId, label: byId.get(m.userId) ?? m.userId, resolved: byId.has(m.userId) }));
  }, [detail.data, roster.data]);

  const affected = (k: QueryKeys) => [k.groups.all()];
  const create = useAccessMutation(slug, (v: GroupFormValues) =>
    accessApi.createGroup({ name: v.name.trim(), description: v.description.trim() || undefined, parentGroupId: v.parentGroupId === NO_PARENT ? undefined : v.parentGroupId }), affected);
  const update = useAccessMutation(slug, (v: { id: string; values: GroupFormValues }) =>
    accessApi.updateGroup(v.id, { name: v.values.name.trim(), description: v.values.description.trim() }), affected);
  const remove = useAccessMutation(slug, (id: string) => accessApi.deleteGroup(id), affected);
  const addMembers = useAccessMutation(slug, async (v: { id: string; userIds: string[] }) => {
    for (const userId of v.userIds) await accessApi.addGroupMember(v.id, userId);
  }, affected);
  const removeMember = useAccessMutation(slug, (v: { id: string; userId: string }) => accessApi.removeGroupMember(v.id, v.userId), affected);
  const attach = useAccessMutation(slug, async (v: { id: string; policyIds: string[] }) => {
    for (const policyId of v.policyIds) await accessApi.attachGroupPolicy(v.id, policyId);
  }, affected);
  const detach = useAccessMutation(slug, (v: { id: string; policyId: string }) => accessApi.detachGroupPolicy(v.id, v.policyId), affected);

  const close = () => {
    setDialog(null);
    setMemberSearch("");
    [create, update, remove, addMembers, removeMember, attach, detach].forEach((m) => m.reset());
  };
  const run = (promise: Promise<unknown>, after?: () => void) => promise.then(() => { close(); after?.(); }, () => undefined);

  const labels = useTableLabels<Row>({
    base: "access.groups.table",
    rowName: (r) => r.group.name,
    pageStatus: t("common.labels.results", { count: rows.length }),
    onRetry: () => void groups.refetch(),
    onClear: () => setSearch(""),
    onCreate: canWrite ? () => setDialog({ kind: "create" }) : undefined,
  });
  const columns: ResourceColumn<Row>[] = [
    {
      header: t("access.groups.columns.name"),
      accessorKey: (r) => (
        <span className={`block min-w-0 break-words ${INDENT[Math.min(r.depth, INDENT.length - 1)]}`}>
          {r.group.name}
        </span>
      ),
    },
    { header: t("access.groups.columns.description"), accessorKey: (r) => <span className="block break-words">{r.group.description ?? ""}</span> },
    { header: t("access.groups.columns.path"), accessorKey: (r) => <span className="block break-all font-mono text-xs">{r.group.path}</span> },
  ];

  const existing = new Set((detail.data?.members ?? []).map((m) => m.userId));
  const gid = selectedId ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("access.groups.title")}
        subtitle={t("access.groups.subtitle")}
        action={canWrite ? <SentryButton variant="primary" onClick={() => setDialog({ kind: "create" })}>{t("access.groups.create")}</SentryButton> : undefined}
      />
      <ResourceTable<Row>
        columns={columns}
        rows={rows}
        status={queryStatus(groups)}
        labels={labels}
        searchValue={search}
        onSearchChange={setSearch}
        isFiltered={search.trim() !== ""}
        isRefreshing={groups.isFetching}
        onRowClick={(r) => setSelectedId(r.id)}
        rowActions={(r) => [{ id: "open", label: t("access.roles.actions.open"), onSelect: () => setSelectedId(r.id) }]}
      />
      {selectedId && detail.isPending && <p role="status" className="font-body text-sm text-muted-foreground">{t("states.loading.title")}</p>}
      {selectedId && detail.isError && <p role="alert" className="font-body text-sm text-destructive">{errorText(detail.error)}</p>}
      {detail.data && selectedId && (
        <GroupDetailPanel
          detail={detail.data}
          members={memberRows}
          canWrite={canWrite}
          onEdit={() => setDialog({ kind: "edit" })}
          onDelete={() => setDialog({ kind: "delete" })}
          onAddMembers={() => setDialog({ kind: "addMembers" })}
          onRemoveMember={(member) => setDialog({ kind: "removeMember", member })}
          onAttachPolicy={() => setDialog({ kind: "attachPolicy" })}
          onDetachPolicy={(policyId, name) => setDialog({ kind: "detachPolicy", policyId, name })}
        />
      )}

      <GroupFormDialog
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        onOpenChange={(open) => !open && close()}
        group={dialog?.kind === "edit" ? detail.data?.group : undefined}
        groups={groups.data ?? []}
        pending={create.isPending || update.isPending}
        error={errorText(dialog?.kind === "edit" ? update.error : create.error)}
        onSubmit={(values) => void (dialog?.kind === "edit" ? run(update.mutateAsync({ id: gid, values })) : run(create.mutateAsync(values)))}
      />
      <PickerDialog
        open={dialog?.kind === "addMembers"}
        onOpenChange={(open) => !open && close()}
        title={t("access.groups.addMembers.title")}
        description={t("access.groups.addMembers.description")}
        legend={t("access.groups.addMembers.legend")}
        toolbar={<TextField label={t("access.groups.addMembers.search")} type="search" value={memberSearch} onChange={setMemberSearch} autoComplete="off" />}
        items={(directory.data?.users ?? []).filter((u) => !existing.has(u.id)).map((u) => ({ id: u.id, label: personName(u), description: u.email }))}
        emptyText={t(directory.isPending ? "states.loading.title" : "access.groups.addMembers.empty")}
        confirmLabel={t("access.groups.addMembers.confirm")}
        pending={addMembers.isPending}
        error={errorText(addMembers.error) ?? errorText(directory.error)}
        onConfirm={(userIds) => void run(addMembers.mutateAsync({ id: gid, userIds }))}
      />
      <PickerDialog
        open={dialog?.kind === "attachPolicy"}
        onOpenChange={(open) => !open && close()}
        title={t("access.roles.attachPolicy.title")}
        description={t("access.groups.attachPolicy.description")}
        legend={t("access.roles.attachPolicy.legend")}
        items={(policies.data?.data ?? [])
          .filter((p) => !(detail.data?.policies ?? []).some((l) => l.policyId === p.id))
          .map((p) => ({ id: p.id, label: p.name, description: p.description ?? undefined }))}
        emptyText={t("access.roles.attachPolicy.empty")}
        confirmLabel={t("access.roles.attachPolicy.confirm")}
        pending={attach.isPending}
        error={errorText(attach.error)}
        onConfirm={(policyIds) => void run(attach.mutateAsync({ id: gid, policyIds }))}
      />
      <ConfirmDialog
        open={dialog?.kind === "removeMember"}
        onOpenChange={(open) => !open && close()}
        title={t("access.groups.removeMember.title")}
        description={t("access.groups.removeMember.description", { name: dialog?.kind === "removeMember" ? dialog.member.label : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.groups.removeMember.effect")]}
        confirmLabel={t("access.groups.removeMember.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={removeMember.isPending}
        error={errorText(removeMember.error)}
        onConfirm={() => { void (dialog?.kind === "removeMember" && run(removeMember.mutateAsync({ id: gid, userId: dialog.member.userId }))); }}
      />
      <ConfirmDialog
        open={dialog?.kind === "detachPolicy"}
        onOpenChange={(open) => !open && close()}
        title={t("access.roles.detachPolicy.title")}
        description={t("access.roles.detachPolicy.description", { name: dialog?.kind === "detachPolicy" ? dialog.name : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.roles.detachPolicy.effect")]}
        confirmLabel={t("access.roles.detachPolicy.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={detach.isPending}
        error={errorText(detach.error)}
        onConfirm={() => { void (dialog?.kind === "detachPolicy" && run(detach.mutateAsync({ id: gid, policyId: dialog.policyId }))); }}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title={t("access.groups.delete.title")}
        description={t("access.groups.delete.description", { name: detail.data?.group.name ?? "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("access.groups.delete.effectMembers"), t("access.roles.delete.effectIrreversible")]}
        confirmLabel={t("access.groups.delete.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={remove.isPending}
        error={errorText(remove.error)}
        onConfirm={() => { void (run(remove.mutateAsync(gid), () => setSelectedId(null))); }}
      />
    </div>
  );
}
