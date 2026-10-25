"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, PageHeader, ResourceTable, SentryButton, type ResourceColumn } from "@repo/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/components/ui/tabs";
import { tenantRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { usePermission } from "@/hooks/use-permission";
import { errorText, queryStatus } from "@/features/access/api/error-text";
import { useRoles } from "@/features/access/api/use-access";
import { useTableLabels } from "@/features/access/components/table-labels";
import { useInvites, useUsersList } from "../api/use-users";
import { useUserActions } from "../api/use-user-actions";
import { InvitationsPanel } from "../components/InvitationsPanel";
import { InviteDialog } from "../components/InviteDialog";
import { PersonActionDialog, type PersonDialogAction } from "../components/PersonActionDialog";
import { PersonStatusBadge } from "../components/PersonStatusBadge";
import { DEFAULT_FILTERS, isFiltered, withFilters, type PeopleFilters, type PeopleStatusFilter } from "../model/list-query";
import { personName, personStatus } from "../model/person";
import { formatRelative } from "../model/time";
import type { PendingInviteDto, UserListItemDto } from "../model/types";
import { DEFAULT_INVITE_DAYS } from "../model/invites";

const STATUS_FILTERS: readonly PeopleStatusFilter[] = ["all", "active", "verified"];

type Pending = { kind: "person"; action: PersonDialogAction; user: UserListItemDto } | { kind: "revoke"; invite: PendingInviteDto } | { kind: "resend"; invite: PendingInviteDto };

export function PeopleView({ slug }: { slug: string }) {
  const { t, tk } = useCopy();
  const router = useRouter();
  const { can } = usePermission();
  const canWrite = can("users:write");
  const [filters, setFilters] = useState<PeopleFilters>(DEFAULT_FILTERS);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [exportError, setExportError] = useState<string | undefined>();

  const users = useUsersList(slug, filters);
  const invites = useInvites(slug);
  const roles = useRoles(slug, inviteOpen || invites.isSuccess);
  const actions = useUserActions(slug);
  const routes = tenantRoutes(slug);
  const now = Date.now();

  const rows = users.data?.users ?? [];
  const pagination = users.data?.pagination;
  const closePending = () => { setPending(null); actions.lock.reset(); actions.unlock.reset(); actions.revokeInvite.reset(); actions.resend.reset(); };
  const closeInvite = () => { setInviteOpen(false); actions.invite.reset(); };

  const labels = useTableLabels<UserListItemDto>({
    base: "users.table",
    rowName: personName,
    pageStatus: pagination ? t("common.labels.pageOf", { page: pagination.page, total: Math.max(1, pagination.totalPages) }) : "",
    onRetry: () => void users.refetch(),
    onClear: () => setFilters(DEFAULT_FILTERS),
    onCreate: canWrite ? () => setInviteOpen(true) : undefined,
  });

  const columns: ResourceColumn<UserListItemDto>[] = useMemo(() => [
    {
      header: t("users.list.columns.person"),
      accessorKey: (u: UserListItemDto) => (
        <span className="block min-w-0">
          <span className="block break-words font-body text-sm text-foreground">{personName(u)}</span>
          <span className="block break-all font-body text-xs text-muted-foreground">{u.email}</span>
        </span>
      ),
    },
    { header: t("users.list.columns.status"), accessorKey: (u: UserListItemDto) => <PersonStatusBadge status={personStatus(u, now)} /> },
    { header: t("users.list.columns.lastActive"), accessorKey: (u: UserListItemDto) => formatRelative(u.lastLoginAt, now) ?? t("users.list.neverSignedIn") },
  ], [t, now]);

  const runPerson = (action: PersonDialogAction, user: UserListItemDto) => {
    const call = action === "suspend" ? actions.lock : actions.unlock;
    call.mutateAsync(user.id).then(closePending, () => undefined);
  };
  const activeMutation = pending?.kind === "person" ? (pending.action === "suspend" ? actions.lock : actions.unlock) : null;

  const exportCsv = () => {
    setExportError(undefined);
    actions.exportCsv(filters).catch((e: unknown) => setExportError(errorText(e)));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("users.list.title")}
        subtitle={t("users.list.subtitle")}
        action={canWrite ? <SentryButton variant="primary" onClick={() => setInviteOpen(true)}>{t("users.list.invite")}</SentryButton> : undefined}
      />
      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">{t("users.list.tabs.people", { count: pagination?.total ?? 0 })}</TabsTrigger>
          <TabsTrigger value="invitations">{t("users.list.tabs.invitations", { count: invites.data?.length ?? 0 })}</TabsTrigger>
        </TabsList>
        <TabsContent value="people" className="space-y-3 pt-4">
          <ResourceTable<UserListItemDto>
            columns={columns}
            rows={rows}
            status={queryStatus(users)}
            labels={labels}
            searchValue={filters.search}
            onSearchChange={(search) => setFilters((f) => withFilters(f, { search }))}
            isFiltered={isFiltered(filters)}
            isRefreshing={users.isFetching}
            filters={
              <>
                <label className="block font-display text-[13px] font-medium text-foreground">
                  {t("users.list.statusFilter")}
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((f) => withFilters(f, { status: e.target.value as PeopleStatusFilter }))}
                    className="mt-1.5 block h-[42px] rounded-sm border border-border bg-muted px-3 font-body text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {STATUS_FILTERS.map((s) => <option key={s} value={s}>{tk(`users.list.statusOptions.${s}`)}</option>)}
                  </select>
                </label>
                <SentryButton variant="outline" onClick={exportCsv}>{t("users.list.export")}</SentryButton>
              </>
            }
            pagination={pagination ? {
              page: pagination.page,
              hasPrevious: pagination.hasPreviousPage,
              hasNext: pagination.hasNextPage,
              onPrevious: () => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) })),
              onNext: () => setFilters((f) => ({ ...f, page: f.page + 1 })),
            } : undefined}
            onRowClick={(u) => router.push(routes.user(u.id))}
            rowActions={(u) => [
              { id: "open", label: t("users.list.rowOpen"), onSelect: () => router.push(routes.user(u.id)) },
              ...(canWrite
                ? [personStatus(u, now) === "suspended"
                    ? { id: "reactivate", label: t("users.list.rowReactivate"), onSelect: () => setPending({ kind: "person", action: "reactivate" as const, user: u }) }
                    : { id: "suspend", label: t("users.list.rowSuspend"), destructive: true, onSelect: () => setPending({ kind: "person", action: "suspend" as const, user: u }) }]
                : []),
            ]}
          />
          {exportError && <p role="alert" className="font-body text-sm text-destructive">{exportError}</p>}
        </TabsContent>
        <TabsContent value="invitations" className="pt-4">
          <InvitationsPanel
            invites={invites.data ?? []}
            roles={roles.data ?? []}
            status={queryStatus(invites)}
            canWrite={canWrite}
            onRetry={() => void invites.refetch()}
            onInvite={() => setInviteOpen(true)}
            onRevoke={(invite) => setPending({ kind: "revoke", invite })}
            onResend={(invite) => setPending({ kind: "resend", invite })}
          />
        </TabsContent>
      </Tabs>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={(open) => (open ? setInviteOpen(true) : closeInvite())}
        roles={roles.data ?? []}
        rolesLoading={roles.isPending}
        pending={actions.invite.isPending}
        error={errorText(actions.invite.error)}
        outcomes={actions.invite.data ?? null}
        onSend={(input) => actions.invite.mutate(input)}
      />
      <PersonActionDialog
        action={pending?.kind === "person" ? pending.action : null}
        personName={pending?.kind === "person" ? personName(pending.user) : ""}
        onClose={closePending}
        onConfirm={(action) => pending?.kind === "person" && runPerson(action, pending.user)}
        pending={activeMutation?.isPending ?? false}
        error={errorText(activeMutation?.error)}
      />
      <ConfirmDialog
        open={pending?.kind === "revoke"}
        onOpenChange={(open) => !open && closePending()}
        title={t("users.invitations.revokeDialog.title")}
        description={t("users.invitations.revokeDialog.description", { email: pending?.kind === "revoke" ? pending.invite.email : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("users.invitations.revokeDialog.effect")]}
        confirmLabel={t("users.invitations.revoke")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={actions.revokeInvite.isPending}
        error={errorText(actions.revokeInvite.error)}
        onConfirm={() => { void (pending?.kind === "revoke" && actions.revokeInvite.mutateAsync(pending.invite.id).then(closePending, () => undefined)); }}
      />
      <ConfirmDialog
        open={pending?.kind === "resend"}
        onOpenChange={(open) => !open && closePending()}
        title={t("users.invitations.resendDialog.title")}
        description={t("users.invitations.resendDialog.description", { email: pending?.kind === "resend" ? pending.invite.email : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("users.invitations.resendDialog.effect1"), t("users.invitations.resendDialog.effect2")]}
        confirmLabel={t("users.invitations.resend")}
        cancelLabel={t("common.actions.cancel")}
        pending={actions.resend.isPending}
        error={errorText(actions.resend.error)}
        onConfirm={() => { void (pending?.kind === "resend" && actions.resend.mutateAsync({ id: pending.invite.id, email: pending.invite.email, roleIds: pending.invite.roleIds, expiresInDays: DEFAULT_INVITE_DAYS }).then(closePending, () => undefined)); }}
      />
    </div>
  );
}
