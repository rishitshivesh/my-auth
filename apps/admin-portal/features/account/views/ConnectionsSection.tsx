"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@repo/ui";
import { useCopy } from "@/i18n";
import { accountApi } from "../api/account-api";
import { useConnectionsQuery, useRefresh } from "../api/use-account-queries";
import { useAsyncAction } from "../api/use-async-action";
import { useStepUp } from "../api/use-step-up";
import { ConnectionList } from "../components/ConnectionList";
import { MethodCard } from "../components/MethodCard";
import { Notice } from "../components/Notice";
import { queryStatus, ResourceBoundary } from "../components/ResourceBoundary";
import { parseLinkResult, providerLabelKey, providerRows, type SocialProviderId } from "../model/social";

const ACTION = "social-unlink";

export function ConnectionsSection() {
  const { t, tk } = useCopy();
  const query = useConnectionsQuery();
  const refresh = useRefresh();
  const link = useAsyncAction(accountApi.startLinking);
  const unlink = useAsyncAction(accountApi.unlinkConnection);
  const stepUp = useStepUp(ACTION);
  const linkResult = parseLinkResult(useSearchParams().get("link"));
  const [linking, setLinking] = useState<SocialProviderId | undefined>();
  const [target, setTarget] = useState<SocialProviderId | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  const onConnect = async (provider: SocialProviderId) => {
    setMessage(undefined);
    setLinking(provider);
    // On success the browser leaves for the provider; on failure we stay and say so.
    await link.run(provider);
    setLinking(undefined);
  };
  const onDisconnect = async () => {
    if (!target) return;
    if ((await unlink.run(target)) === undefined) return;
    setTarget(undefined);
    setMessage(t("account.social.disconnectDialog.success"));
    await refresh("connections");
  };
  const linkError = link.error ? `${t("account.social.linkFailed")} ${link.error}` : undefined;
  // TODO(gap:Profile response shape): the profile does not say whether a password exists, so
  // last-sign-in-method protection is left to the server; its refusal is shown in the dialog.
  const providerName = target ? tk(providerLabelKey(target)) : "";

  return (
    <MethodCard
      id="account-social"
      title={t("account.social.title")}
      description={t("account.social.description")}
    >
      <ResourceBoundary
        status={queryStatus(query)}
        loadingTitle={t("common.labels.loading")}
        errorTitle={t("account.social.loadFailed")}
        retryLabel={t("common.actions.retry")}
        onRetry={() => void query.refetch()}
      >
        {linkResult && (
          <Notice tone={linkResult === "linked" ? "success" : linkResult === "cancelled" ? "info" : "error"}>
            {t(`account.social.linkResult.${linkResult}`)}
          </Notice>
        )}
        {message && <Notice tone="success">{message}</Notice>}
        {stepUp.resumed && <Notice tone="info">{t("account.security.resumed")}</Notice>}
        {linkError && <Notice tone="error">{linkError}</Notice>}
        {query.data?.length === 0 && (
          <p className="font-body text-sm text-muted-foreground" role="status">{t("account.social.empty")}</p>
        )}
        <ConnectionList
          rows={providerRows(query.data ?? [])}
          linking={linking}
          onConnect={(provider) => void onConnect(provider)}
          onDisconnect={(provider) => { unlink.clear(); setMessage(undefined); setTarget(provider); }}
        />
        <p className="font-body text-xs text-muted-foreground">{t("account.social.linkNote")}</p>
      </ResourceBoundary>
      <ConfirmDialog
        open={target !== undefined}
        onOpenChange={(open) => { if (!open) { setTarget(undefined); unlink.clear(); } }}
        title={t("account.social.disconnectDialog.title", { provider: providerName })}
        description={t("account.social.disconnectDialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("account.social.disconnectDialog.effects.e1"), t("account.social.disconnectDialog.effects.e2")]}
        confirmLabel={t("account.social.disconnectDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={unlink.pending}
        error={stepUp.recentAuthFor(unlink.failure).required ? undefined : unlink.error}
        recentAuth={stepUp.recentAuthFor(unlink.failure)}
        onConfirm={onDisconnect}
      />
    </MethodCard>
  );
}
