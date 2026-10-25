"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, SentryButton } from "@repo/ui";
import { authRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { accountApi } from "../api/account-api";
import { useRefresh, useSessionsQuery } from "../api/use-account-queries";
import { useAsyncAction } from "../api/use-async-action";
import { Notice } from "../components/Notice";
import { queryStatus, ResourceBoundary } from "../components/ResourceBoundary";
import { SecurityTabs } from "../components/SecurityTabs";
import { SessionTable } from "../components/SessionTable";
import { sortSessions, toSessionRow, type SessionRow } from "../model/sessions";
import { PageFrame } from "@/components/page/PageFrame";

type Dialog = { kind: "none" } | { kind: "one"; row: SessionRow } | { kind: "others" } | { kind: "all" };

export function SessionsView() {
  const { t } = useCopy();
  const router = useRouter();
  const query = useSessionsQuery();
  const refresh = useRefresh();
  const revokeOne = useAsyncAction(accountApi.revokeSession);
  const revokeOthers = useAsyncAction(accountApi.revokeOtherSessions);
  const revokeAll = useAsyncAction(accountApi.revokeAllSessions);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [message, setMessage] = useState<string | undefined>();

  const rows = useMemo(() => sortSessions((query.data ?? []).map(toSessionRow)), [query.data]);
  const now = query.dataUpdatedAt || 0;
  const hasOthers = rows.some((r) => !r.isCurrent);

  const close = () => {
    setDialog({ kind: "none" });
    revokeOne.clear();
    revokeOthers.clear();
    revokeAll.clear();
  };
  const finish = async (text: string) => {
    setDialog({ kind: "none" });
    setMessage(text);
    await refresh("sessions");
  };
  const onRevokeOne = async () => {
    if (dialog.kind !== "one") return;
    if ((await revokeOne.run(dialog.row.id)) === undefined) return;
    await finish(t("account.sessions.revokeDialog.success"));
  };
  const onRevokeOthers = async () => {
    if ((await revokeOthers.run()) === undefined) return;
    await finish(t("account.sessions.othersDialog.success"));
  };
  const onRevokeAll = async () => {
    // The SDK ends the local session; leave only after the server confirmed.
    if ((await revokeAll.run()) === undefined) return;
    router.push(authRoutes.login());
  };

  return (
    <PageFrame size="narrow" title={t("account.sessions.title")} subtitle={t("account.sessions.description")}>
      <SecurityTabs current="sessions" />
      {message && <Notice tone="success">{message}</Notice>}
      <ResourceBoundary
        status={queryStatus(query)}
        loadingTitle={t("account.sessions.loading")}
        errorTitle={t("account.sessions.loadFailed")}
        retryLabel={t("common.actions.retry")}
        onRetry={() => void query.refetch()}
      >
        <SessionTable rows={rows} now={now} onRevoke={(row) => { setMessage(undefined); setDialog({ kind: "one", row }); }} />
        <div className="flex flex-wrap gap-3">
          <SentryButton variant="primary" disabled={!hasOthers} onClick={() => { setMessage(undefined); setDialog({ kind: "others" }); }}>
            {t("account.sessions.signOutOthers")}
          </SentryButton>
          <SentryButton variant="outline" onClick={() => { setMessage(undefined); setDialog({ kind: "all" }); }}>
            {t("account.sessions.signOutAll")}
          </SentryButton>
        </div>
      </ResourceBoundary>

      <ConfirmDialog
        open={dialog.kind === "one"}
        onOpenChange={(open) => { if (!open) close(); }}
        title={t("account.sessions.revokeDialog.title")}
        description={t("account.sessions.revokeDialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("account.sessions.revokeDialog.effects.e1"), t("account.sessions.revokeDialog.effects.e2")]}
        confirmLabel={t("account.sessions.revokeDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={revokeOne.pending}
        error={revokeOne.error}
        onConfirm={onRevokeOne}
      />
      <ConfirmDialog
        open={dialog.kind === "others"}
        onOpenChange={(open) => { if (!open) close(); }}
        title={t("account.sessions.othersDialog.title")}
        description={t("account.sessions.othersDialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("account.sessions.othersDialog.effects.e1"), t("account.sessions.othersDialog.effects.e2")]}
        confirmLabel={t("account.sessions.othersDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={revokeOthers.pending}
        error={revokeOthers.error}
        onConfirm={onRevokeOthers}
      />
      <ConfirmDialog
        open={dialog.kind === "all"}
        onOpenChange={(open) => { if (!open) close(); }}
        title={t("account.sessions.allDialog.title")}
        description={t("account.sessions.allDialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("account.sessions.allDialog.effects.e1"), t("account.sessions.allDialog.effects.e2")]}
        confirmLabel={t("account.sessions.allDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={revokeAll.pending}
        error={revokeAll.error}
        onConfirm={onRevokeAll}
      />
    </PageFrame>
  );
}
