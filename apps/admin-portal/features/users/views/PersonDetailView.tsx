"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@scrolloop/sdk";
import { ConfirmDialog, PageHeader, SentryButton, StateView } from "@repo/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { tenantRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { usePermission } from "@/hooks/use-permission";
import { reauthUrl } from "@/lib/recent-auth";
import { errorText, isNotFound, isRecentAuthRequired, queryStatus } from "@/features/access/api/error-text";
import { useRoles, useUserAccess } from "@/features/access/api/use-access";
import { roleLabel } from "@/features/access/model/role-diff";
import type { RoleDto } from "@/features/access/model/types";
import { useUserActions } from "../api/use-user-actions";
import { useUserDetail, useUserEvents, useUserSessions } from "../api/use-users";
import { ActivityPanel } from "../components/ActivityPanel";
import { AssignRolesDialog } from "../components/AssignRolesDialog";
import { EditProfileDialog } from "../components/EditProfileDialog";
import { PersonAccessPanel } from "../components/PersonAccessPanel";
import { PersonActionDialog, type PersonDialogAction } from "../components/PersonActionDialog";
import { PersonStatusBadge } from "../components/PersonStatusBadge";
import { SessionsPanel } from "../components/SessionsPanel";
import { availableActions, personName, personStatus, profileValuesOf } from "../model/person";
import { formatDate, formatRelative } from "../model/time";
import type { UserSessionDto } from "../model/types";

type Dialog =
  | { kind: "action"; action: PersonDialogAction } | { kind: "edit" } | { kind: "assign" }
  | { kind: "revokeRole"; role: RoleDto } | { kind: "revokeSession"; session: UserSessionDto };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <dt className="font-body text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-end font-body text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function PersonDetailView({ slug, userId }: { slug: string; userId: string }) {
  const { t } = useCopy();
  const router = useRouter();
  const { user: me } = useAuth();
  const { can } = usePermission();
  const canWrite = can("users:write");
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const detail = useUserDetail(slug, userId);
  const access = useUserAccess(slug, userId);
  const allRoles = useRoles(slug, dialog?.kind === "assign");
  const sessions = useUserSessions(slug, userId, tab === "sessions");
  const events = useUserEvents(slug, userId, tab === "activity");
  const actions = useUserActions(slug);

  const person = detail.data;
  const name = person ? personName(person) : "";
  const status = person ? personStatus(person) : "active";
  const allowed = useMemo(() => new Set(person ? availableActions(status, me?.id === person.id) : []), [person, status, me?.id]);

  const close = () => {
    setDialog(null);
    [actions.lock, actions.unlock, actions.remove, actions.forceReset, actions.update, actions.revokeSession, actions.assignRoles, actions.revokeRole].forEach((m) => m.reset());
  };
  const here = tenantRoutes(slug).user(userId);
  const reauth = (error: unknown) => (isRecentAuthRequired(error) ? { onReauthenticate: () => window.location.assign(reauthUrl(here)) } : undefined);

  if (detail.isPending) return <StateView kind="loading" title={t("states.loading.title")} />;
  if (detail.isError) {
    return isNotFound(detail.error)
      ? <StateView kind="not-found" title={t("users.detail.notFoundTitle")} description={t("users.detail.notFoundDescription")} action={{ label: t("users.detail.backToPeople"), onClick: () => router.push(tenantRoutes(slug).users()) }} />
      : <StateView kind={queryStatus(detail) === "denied" ? "denied" : "error"} title={t(queryStatus(detail) === "denied" ? "states.denied.title" : "states.error.title")} description={errorText(detail.error)} action={{ label: t("common.actions.retry"), onClick: () => void detail.refetch() }} />;
  }
  if (!person) return null;

  const actionMutation = (action: PersonDialogAction) =>
    action === "suspend" ? actions.lock : action === "reactivate" ? actions.unlock : action === "delete" ? actions.remove : action === "forceReset" ? actions.forceReset : actions.revokeSession;
  const openAction = (action: PersonDialogAction) => canWrite && allowed.has(action === "revokeSessions" ? "revokeSessions" : action) && setDialog({ kind: "action", action });
  const current = dialog?.kind === "action" ? actionMutation(dialog.action) : null;
  const confirmAction = (action: PersonDialogAction) => {
    if (action === "revokeSessions") {
      Promise.all((sessions.data ?? []).map((s) => actions.revokeSession.mutateAsync({ id: person.id, sessionId: s.id }))).then(close, () => undefined);
      return;
    }
    const m = actionMutation(action) as typeof actions.lock;
    m.mutateAsync(person.id).then(() => { close(); if (action === "delete") router.push(tenantRoutes(slug).users()); }, () => undefined);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        subtitle={t("users.detail.subtitle", { email: person.email, date: formatDate(person.createdAt) ?? "" })}
        action={<PersonStatusBadge status={status} />}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t("users.detail.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="access">{t("users.detail.tabs.access")}</TabsTrigger>
          <TabsTrigger value="sessions">{t("users.detail.tabs.sessions")}</TabsTrigger>
          <TabsTrigger value="activity">{t("users.detail.tabs.activity")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-6 pt-4 lg:grid-cols-2">
          <section aria-labelledby="profile-title" className="rounded-md border border-border bg-card p-4 sm:p-6">
            <h2 id="profile-title" className="font-display text-base font-semibold text-foreground">{t("users.detail.profile")}</h2>
            <dl className="mt-2 divide-y divide-border">
              <Row label={t("users.detail.fullName")} value={name} />
              <Row label={t("users.detail.email")} value={person.email} />
              <Row label={t("users.detail.status")} value={t(`users.status.${status}`)} />
              <Row label={t("users.detail.verification")} value={t(person.emailVerified ? "users.detail.verified" : "users.detail.unverified")} />
              <Row label={t("users.detail.lastSignIn")} value={formatRelative(person.lastLoginAt) ?? t("users.list.neverSignedIn")} />
            </dl>
            {canWrite && allowed.has("edit") && <SentryButton className="mt-4" variant="outline" onClick={() => setDialog({ kind: "edit" })}>{t("users.detail.edit")}</SentryButton>}
          </section>
          <section aria-labelledby="signin-title" className="space-y-3 rounded-md border border-border bg-card p-4 sm:p-6">
            <h2 id="signin-title" className="font-display text-base font-semibold text-foreground">{t("users.detail.signIn")}</h2>
            <p className="font-body text-sm text-muted-foreground">
              {t(person.mfaSettings?.isEnabled ? "users.detail.mfaOn" : "users.detail.mfaOff")}
            </p>
            <p className="font-body text-sm text-muted-foreground">
              {(access.roles.data ?? []).map(roleLabel).join(", ") || t("users.roles.none")}
            </p>
            {canWrite && (
              <div className="flex flex-col items-start gap-2">
                <SentryButton variant="outline" onClick={() => setTab("sessions")}>{t("users.detail.viewSessions")}</SentryButton>
                {allowed.has("forceReset") && <SentryButton variant="outline" onClick={() => openAction("forceReset")}>{t("users.detail.forceReset")}</SentryButton>}
                {allowed.has("suspend") && <SentryButton variant="outline" onClick={() => openAction("suspend")}>{t("users.detail.suspend")}</SentryButton>}
                {allowed.has("reactivate") && <SentryButton variant="outline" onClick={() => openAction("reactivate")}>{t("users.detail.reactivate")}</SentryButton>}
                {allowed.has("delete") && <SentryButton variant="destructive" onClick={() => openAction("delete")}>{t("users.detail.delete")}</SentryButton>}
              </div>
            )}
          </section>
        </TabsContent>
        <TabsContent value="access" className="pt-4">
          <PersonAccessPanel
            roles={access.roles.data ?? []}
            permissions={access.permissions.data ?? []}
            status={access.roles.isPending || access.permissions.isPending ? "loading" : access.roles.isError || access.permissions.isError ? "error" : "ready"}
            canWrite={canWrite}
            onAssign={() => setDialog({ kind: "assign" })}
            onRevoke={(role) => setDialog({ kind: "revokeRole", role })}
            onRetry={() => { void access.roles.refetch(); void access.permissions.refetch(); }}
          />
        </TabsContent>
        <TabsContent value="sessions" className="pt-4">
          <SessionsPanel
            sessions={sessions.data ?? []}
            status={sessions.isPending ? "loading" : sessions.isError ? "error" : "ready"}
            canWrite={canWrite}
            onRevoke={(session) => setDialog({ kind: "revokeSession", session })}
            onRevokeAll={() => openAction("revokeSessions")}
            onRetry={() => void sessions.refetch()}
          />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <ActivityPanel events={events.data ?? []} status={events.isPending ? "loading" : events.isError ? "error" : "ready"} onRetry={() => void events.refetch()} />
        </TabsContent>
      </Tabs>

      <PersonActionDialog
        action={dialog?.kind === "action" ? dialog.action : null}
        personName={name}
        onClose={close}
        onConfirm={confirmAction}
        pending={current?.isPending ?? false}
        error={errorText(current?.error)}
        recentAuth={reauth(current?.error)}
      />
      <EditProfileDialog
        open={dialog?.kind === "edit"}
        onOpenChange={(open) => !open && close()}
        initial={profileValuesOf(person)}
        pending={actions.update.isPending}
        error={errorText(actions.update.error)}
        onSubmit={(changes) => actions.update.mutateAsync({ id: person.id, body: changes }).then(close, () => undefined)}
      />
      <AssignRolesDialog
        open={dialog?.kind === "assign"}
        onOpenChange={(open) => !open && close()}
        personName={name}
        assigned={access.roles.data ?? []}
        allRoles={allRoles.data ?? []}
        pending={actions.assignRoles.isPending}
        error={errorText(actions.assignRoles.error)}
        succeeded={actions.assignRoles.isSuccess}
        onConfirm={(input) => actions.assignRoles.mutate({ userId: person.id, ...input })}
        onViewEffective={() => setTab("access")}
      />
      <ConfirmDialog
        open={dialog?.kind === "revokeRole"}
        onOpenChange={(open) => !open && close()}
        title={t("users.roles.revokeDialog.title", { name })}
        description={t("users.roles.revokeDialog.description", { role: dialog?.kind === "revokeRole" ? roleLabel(dialog.role) : "" })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("users.roles.revokeDialog.effect1"), t("users.roles.revokeDialog.effect2")]}
        confirmLabel={t("users.roles.revoke")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={actions.revokeRole.isPending}
        error={errorText(actions.revokeRole.error)}
        recentAuth={reauth(actions.revokeRole.error) && { required: true, notice: t("common.dialog.recentAuthNotice"), actionLabel: t("common.dialog.recentAuthAction"), onReauthenticate: () => window.location.assign(reauthUrl(here)) }}
        onConfirm={() => { void (dialog?.kind === "revokeRole" && actions.revokeRole.mutateAsync({ userId: person.id, roleName: dialog.role.name }).then(close, () => undefined)); }}
      />
      <ConfirmDialog
        open={dialog?.kind === "revokeSession"}
        onOpenChange={(open) => !open && close()}
        title={t("users.sessions.revokeDialog.title")}
        description={t("users.sessions.revokeDialog.description", { name })}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("users.sessions.revokeDialog.effect")]}
        confirmLabel={t("users.sessions.revoke")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={actions.revokeSession.isPending}
        error={errorText(actions.revokeSession.error)}
        onConfirm={() => { void (dialog?.kind === "revokeSession" && actions.revokeSession.mutateAsync({ id: person.id, sessionId: dialog.session.id }).then(close, () => undefined)); }}
      />
    </div>
  );
}
