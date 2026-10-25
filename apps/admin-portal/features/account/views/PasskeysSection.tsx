"use client";

import { useState } from "react";
import type { Passkey } from "@scrolloop/sdk";
import { ConfirmDialog } from "@repo/ui";
import { useCopy } from "@/i18n";
import { accountApi } from "../api/account-api";
import { usePasskeysQuery, useRefresh } from "../api/use-account-queries";
import { useAsyncAction } from "../api/use-async-action";
import { useStepUp } from "../api/use-step-up";
import { MethodCard } from "../components/MethodCard";
import { Notice } from "../components/Notice";
import { PasskeyList } from "../components/PasskeyList";
import { queryStatus, ResourceBoundary } from "../components/ResourceBoundary";
import { classifyPasskeyError } from "../model/errors";

const ACTION = "passkey-remove";

export function PasskeysSection() {
  const { t } = useCopy();
  const query = usePasskeysQuery();
  const refresh = useRefresh();
  const add = useAsyncAction(accountApi.addPasskey);
  const remove = useAsyncAction(accountApi.removePasskey);
  const stepUp = useStepUp(ACTION);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<Passkey | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [addedNotice, setAddedNotice] = useState(false);

  const failure = add.failure === undefined ? undefined : classifyPasskeyError(add.failure);
  const unsupported = failure === "unsupported";
  const addMessage =
    failure === "cancelled"
      ? { tone: "info" as const, text: t("account.passkeys.cancelled") }
      : failure === "failed"
        ? { tone: "error" as const, text: `${t("account.passkeys.addFailed")} ${add.error ?? ""}`.trim() }
        : undefined;

  const onAdd = async () => {
    setMessage(undefined);
    setAddedNotice(false);
    const trimmed = name.trim();
    const result = await add.run(trimmed === "" ? undefined : trimmed);
    if (result === undefined) return;
    setName("");
    setAddedNotice(true);
    await refresh("passkeys");
  };
  const onRemove = async () => {
    if (!target) return;
    if ((await remove.run(target.id)) === undefined) return;
    setTarget(undefined);
    setMessage(t("account.passkeys.removeDialog.success"));
    await refresh("passkeys");
  };

  const count = query.data?.length ?? 0;
  const status = query.data
    ? count === 1 ? t("account.passkeys.countOne") : t("account.passkeys.count", { count })
    : undefined;

  return (
    <MethodCard
      id="account-passkeys"
      title={t("account.passkeys.title")}
      description={t("account.passkeys.description")}
      status={status}
    >
      <ResourceBoundary
        status={queryStatus(query)}
        loadingTitle={t("common.labels.loading")}
        errorTitle={t("account.passkeys.loadFailed")}
        retryLabel={t("common.actions.retry")}
        onRetry={() => void query.refetch()}
      >
        {message && <Notice tone="success">{message}</Notice>}
        {stepUp.resumed && <Notice tone="info">{t("account.security.resumed")}</Notice>}
        {addedNotice && <Notice tone="success">{t("account.passkeys.addedNotice")}</Notice>}
        <PasskeyList
          passkeys={query.data ?? []}
          name={name}
          onNameChange={setName}
          onAdd={() => void onAdd()}
          adding={add.pending}
          unsupported={unsupported}
          addMessage={addMessage}
          onRemove={(passkey) => { setMessage(undefined); remove.clear(); setTarget(passkey); }}
        />
      </ResourceBoundary>
      <ConfirmDialog
        open={target !== undefined}
        onOpenChange={(open) => { if (!open) { setTarget(undefined); remove.clear(); } }}
        title={t("account.passkeys.removeDialog.title")}
        description={t("account.passkeys.removeDialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("account.passkeys.removeDialog.effects.e1"), t("account.passkeys.removeDialog.effects.e2")]}
        confirmLabel={t("account.passkeys.removeDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        pending={remove.pending}
        error={stepUp.recentAuthFor(remove.failure).required ? undefined : remove.error}
        recentAuth={stepUp.recentAuthFor(remove.failure)}
        onConfirm={onRemove}
      />
    </MethodCard>
  );
}
