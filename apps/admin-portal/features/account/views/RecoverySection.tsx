"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog, SecretReveal, SentryButton } from "@repo/ui";
import { SECRET_AUTO_HIDE_MS } from "@/constants/limits";
import { useCopy } from "@/i18n";
import { accountApi } from "../api/account-api";
import { useMfaStatusQuery, useRefresh } from "../api/use-account-queries";
import { useAsyncAction } from "../api/use-async-action";
import { useStepUp } from "../api/use-step-up";
import { MethodCard } from "../components/MethodCard";
import { Notice } from "../components/Notice";
import { queryStatus, ResourceBoundary } from "../components/ResourceBoundary";
import { useSecretLabels } from "../components/use-secret-labels";
import { formatRecoveryCodes, summarizeMfa } from "../model/mfa";

const ACTION = "recovery-regenerate";

export function RecoverySection() {
  const { t } = useCopy();
  const status = useMfaStatusQuery();
  const refresh = useRefresh();
  const regenerate = useAsyncAction(accountApi.regenerateBackupCodes);
  const stepUp = useStepUp(ACTION);
  const labels = useSecretLabels(t("account.recovery.revealWarning"), t("account.recovery.done"));
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string | undefined>();

  useEffect(() => {
    if (stepUp.resumed) setOpen(true);
  }, [stepUp.resumed]);

  const summary = status.data ? summarizeMfa(status.data, 0) : undefined;
  const remainingText = summary
    ? summary.backupCodesRemaining === 0
      ? t("account.recovery.none")
      : summary.backupCodesRemaining === 1
        ? t("account.recovery.remainingOne")
        : t("account.recovery.remaining", { count: summary.backupCodesRemaining })
    : undefined;

  const failureText = regenerate.error ? `${t("account.recovery.failed")} ${regenerate.error}` : undefined;

  const run = async () => {
    const result = await regenerate.run();
    if (!result) return;
    setOpen(false);
    setCodes(formatRecoveryCodes(result.backupCodes));
    await refresh("mfa");
  };

  return (
    <MethodCard
      id="account-recovery"
      title={t("account.recovery.title")}
      status={summary?.recoveryState === "unavailable" ? undefined : remainingText}
      statusTone={summary?.recoveryState === "low" || summary?.recoveryState === "none" ? "warn" : "neutral"}
      actions={
        summary && summary.recoveryState !== "unavailable" && !codes ? (
          <SentryButton variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("account.recovery.regenerate")}
          </SentryButton>
        ) : undefined
      }
    >
      <ResourceBoundary
        status={queryStatus(status)}
        loadingTitle={t("common.labels.loading")}
        errorTitle={t("account.mfa.loadFailed")}
        retryLabel={t("common.actions.retry")}
        onRetry={() => void status.refetch()}
      >
        {summary?.recoveryState === "unavailable" && (
          <p className="font-body text-sm text-muted-foreground">{t("account.recovery.needsMfa")}</p>
        )}
        {summary?.recoveryState === "low" && <Notice tone="info">{t("account.recovery.low")}</Notice>}
        {stepUp.resumed && <Notice tone="info">{t("account.security.resumed")}</Notice>}
        {failureText && !open && <Notice tone="error">{failureText}</Notice>}
        {codes && (
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-foreground">{t("account.recovery.revealTitle")}</h3>
            <SecretReveal
              secret={codes}
              labels={labels}
              fieldLabel={t("account.recovery.revealField")}
              onAcknowledge={() => setCodes(undefined)}
              autoHideMs={SECRET_AUTO_HIDE_MS}
            />
          </div>
        )}
      </ResourceBoundary>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => { setOpen(next); if (!next) regenerate.clear(); }}
        title={t("account.recovery.dialog.title")}
        description={t("account.recovery.dialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("account.recovery.dialog.effects.e1"), t("account.recovery.dialog.effects.e2")]}
        confirmLabel={t("account.recovery.dialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={regenerate.pending}
        error={stepUp.recentAuthFor(regenerate.failure).required ? undefined : regenerate.error}
        recentAuth={stepUp.recentAuthFor(regenerate.failure)}
        onConfirm={run}
      />
    </MethodCard>
  );
}
