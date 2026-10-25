"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { accountApi } from "../api/account-api";
import { useMfaStatusQuery, usePasskeysQuery, useRefresh } from "../api/use-account-queries";
import { useAsyncAction } from "../api/use-async-action";
import { useStepUp } from "../api/use-step-up";
import { MethodCard } from "../components/MethodCard";
import { Notice } from "../components/Notice";
import { queryStatus, ResourceBoundary } from "../components/ResourceBoundary";
import { TotpEnrollPanel, type EnrollStage } from "../components/TotpEnrollPanel";
import { formatRecoveryCodes, summarizeMfa } from "../model/mfa";

const ACTION_DISABLE = "mfa-disable-totp";
const ACTION_DISABLE_ALL = "mfa-disable-all";

type Dialog = "none" | "disable" | "disableAll";

export function TotpSection() {
  const { t } = useCopy();
  const status = useMfaStatusQuery();
  const passkeys = usePasskeysQuery();
  const refresh = useRefresh();

  const setup = useAsyncAction(accountApi.setupTotp);
  const confirm = useAsyncAction(accountApi.confirmTotp);
  const disable = useAsyncAction(accountApi.disableTotp);
  const disableAll = useAsyncAction(accountApi.disableAllMfa);
  const stepDisable = useStepUp(ACTION_DISABLE);
  const stepDisableAll = useStepUp(ACTION_DISABLE_ALL);

  const [stage, setStage] = useState<EnrollStage | "idle">("idle");
  const [material, setMaterial] = useState<{ secret: string; qrCode: string } | undefined>();
  const [codes, setCodes] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [dialog, setDialog] = useState<Dialog>("none");
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    if (stepDisable.resumed) setDialog("disable");
    else if (stepDisableAll.resumed) setDialog("disableAll");
  }, [stepDisable.resumed, stepDisableAll.resumed]);

  const summary = status.data ? summarizeMfa(status.data, passkeys.data?.length ?? 0) : undefined;

  const start = async () => {
    setMessage(undefined);
    setStage("starting");
    const result = await setup.run();
    if (!result) {
      setStage("idle");
      return;
    }
    // Only the secret and QR are kept; recovery codes come from the confirmation response.
    setMaterial({ secret: result.secret, qrCode: result.qrCode });
    setStage("scan");
  };
  const verify = async () => {
    const result = await confirm.run(code);
    if (!result) {
      setCode("");
      return;
    }
    setMaterial(undefined);
    setCode("");
    setCodes(formatRecoveryCodes(result.backupCodes));
    setStage("codes");
    await refresh("mfa");
  };
  const cancel = () => {
    setMaterial(undefined);
    setCode("");
    confirm.clear();
    setStage("idle");
  };
  const acknowledged = () => {
    setCodes(undefined);
    setStage("idle");
  };
  const runDisable = async () => {
    if ((await disable.run()) === undefined) return;
    setDialog("none");
    setMessage(t("account.mfa.disableDialog.success"));
    await refresh("mfa");
  };
  const runDisableAll = async () => {
    if ((await disableAll.run()) === undefined) return;
    setDialog("none");
    setMessage(t("account.mfa.disableAll.success"));
    await refresh("mfa", "passkeys");
  };

  const enrolling = stage !== "idle";
  const startError = setup.error ? `${t("account.mfa.enroll.startFailed")} ${setup.error}` : undefined;
  const closeDialog = () => {
    setDialog("none");
    disable.clear();
    disableAll.clear();
  };

  return (
    <MethodCard
      id="account-totp"
      title={t("account.mfa.title")}
      description={t("account.mfa.description")}
      status={summary ? (summary.hasTotp ? t("account.mfa.enabled") : t("account.mfa.disabled")) : undefined}
      statusTone={summary?.hasTotp ? "ok" : "neutral"}
      actions={
        summary && !enrolling ? (
          summary.hasTotp ? (
            <SentryButton variant="outline" size="sm" onClick={() => setDialog("disable")}>
              {t("account.mfa.disable")}
            </SentryButton>
          ) : (
            <SentryButton variant="primary" size="sm" onClick={() => void start()}>
              {t("account.mfa.enable")}
            </SentryButton>
          )
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
        {message && <Notice tone="success">{message}</Notice>}
        {stepDisable.resumed || stepDisableAll.resumed ? <Notice tone="info">{t("account.security.resumed")}</Notice> : null}
        {startError && <Notice tone="error">{startError}</Notice>}
        {stage !== "idle" && (
          <TotpEnrollPanel
            stage={stage}
            setup={material}
            codes={codes}
            code={code}
            onCodeChange={(value) => { confirm.clear(); setCode(value); }}
            onVerify={() => void verify()}
            onCancel={cancel}
            onCodesAcknowledged={acknowledged}
            pending={confirm.pending}
            error={confirm.error ? t("account.mfa.enroll.verifyFailed") : undefined}
          />
        )}
        {summary && summary.hasEmailOtp && (
          <p className="font-body text-xs text-muted-foreground">
            {t("account.mfa.emailOtpLine")}
          </p>
        )}
        {summary?.hasTotp && (
          <SentryButton variant="ghost" size="sm" onClick={() => setDialog("disableAll")}>
            {t("account.mfa.disableAll.action")}
          </SentryButton>
        )}
      </ResourceBoundary>

      <ConfirmDialog
        open={dialog === "disable"}
        onOpenChange={(open) => (open ? setDialog("disable") : closeDialog())}
        title={t("account.mfa.disableDialog.title")}
        description={summary?.totpIsLastMethod ? t("account.mfa.lastMethod") : t("account.mfa.disableDialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[
          t("account.mfa.disableDialog.effects.e1"),
          t("account.mfa.disableDialog.effects.e2"),
          t("account.mfa.disableDialog.effects.e3"),
        ]}
        confirmLabel={t("account.mfa.disableDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={disable.pending}
        error={stepDisable.recentAuthFor(disable.failure).required ? undefined : disable.error}
        recentAuth={stepDisable.recentAuthFor(disable.failure)}
        onConfirm={runDisable}
      />
      <ConfirmDialog
        open={dialog === "disableAll"}
        onOpenChange={(open) => (open ? setDialog("disableAll") : closeDialog())}
        title={t("account.mfa.disableAll.title")}
        description={t("account.mfa.disableAll.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[
          t("account.mfa.disableAll.effects.e1"),
          t("account.mfa.disableAll.effects.e2"),
          t("account.mfa.disableAll.effects.e3"),
        ]}
        confirmLabel={t("account.mfa.disableAll.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={disableAll.pending}
        error={stepDisableAll.recentAuthFor(disableAll.failure).required ? undefined : disableAll.error}
        recentAuth={stepDisableAll.recentAuthFor(disableAll.failure)}
        onConfirm={runDisableAll}
      />
    </MethodCard>
  );
}
