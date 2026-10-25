"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@repo/ui";
import { authRoutes, accountRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { accountApi } from "../api/account-api";
import { useAsyncAction } from "../api/use-async-action";
import { useStepUp } from "../api/use-step-up";
import { DeleteAccountPanel } from "../components/DeleteAccountPanel";
import { Notice } from "../components/Notice";
import { PageFrame } from "@/components/page/PageFrame";

const ACTION = "account-delete";

export function DeleteAccountView() {
  const { t } = useCopy();
  const router = useRouter();
  const remove = useAsyncAction(accountApi.deleteAccount);
  const stepUp = useStepUp(ACTION);
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (stepUp.resumed) setMissing(false);
  }, [stepUp.resumed]);

  const onStart = () => {
    if (!password) {
      setMissing(true);
      return;
    }
    setMissing(false);
    remove.clear();
    setOpen(true);
  };
  const onConfirm = async () => {
    const result = await remove.run(password);
    if (result === undefined) return;
    // Credentials leave memory and the (now ended) session is gone.
    setPassword("");
    setOpen(false);
    setDeleted(true);
    router.replace(authRoutes.login());
  };
  const reauth = stepUp.recentAuthFor(remove.failure);

  if (deleted) {
    return (
      <PageFrame size="narrow" title={t("account.delete.title")}>
        <Notice tone="success">{t("account.delete.done")}</Notice>
      </PageFrame>
    );
  }

  return (
    <PageFrame size="narrow" title={t("account.delete.title")} subtitle={t("account.delete.description")}>
      {stepUp.resumed && <Notice tone="info">{t("account.security.resumed")}</Notice>}
      <DeleteAccountPanel
        password={password}
        onPasswordChange={(value) => { setMissing(false); setPassword(value); }}
        passwordError={missing ? t("account.delete.passwordRequired") : undefined}
        onStart={onStart}
        onCancel={() => router.push(accountRoutes.security())}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => { setOpen(next); if (!next) remove.clear(); }}
        title={t("account.delete.dialog.title")}
        description={t("account.delete.dialog.description")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("account.delete.consequences.e1"), t("account.delete.consequences.e2"), t("account.delete.consequences.e3")]}
        confirmLabel={t("account.delete.dialog.confirm")}
        cancelLabel={t("account.delete.cancel")}
        confirmPhrase={t("account.delete.dialog.phrase")}
        confirmPhraseLabel={t("account.delete.dialog.phraseLabel")}
        destructive
        pending={remove.pending}
        error={reauth.required ? undefined : remove.error ? `${t("account.delete.failed")} ${remove.error}` : undefined}
        recentAuth={reauth}
        onConfirm={onConfirm}
      />
    </PageFrame>
  );
}
