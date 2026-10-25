"use client";

import { useMemo, useState } from "react";
import { useCopy } from "@/i18n";
import { accountApi } from "../api/account-api";
import { useAsyncAction } from "../api/use-async-action";
import { useStepUp } from "../api/use-step-up";
import { Notice } from "../components/Notice";
import { PasswordForm } from "../components/PasswordForm";
import { EMPTY_PASSWORD_DRAFT, isPasswordDraftReady, validatePasswordChange, type PasswordDraft } from "../model/password";

const ACTION = "password-change";

export function PasswordSection() {
  const { t } = useCopy();
  const change = useAsyncAction(accountApi.changePassword);
  const stepUp = useStepUp(ACTION);
  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [touched, setTouched] = useState<ReadonlySet<keyof PasswordDraft>>(new Set());
  const [done, setDone] = useState(false);

  const allErrors = useMemo(() => validatePasswordChange(draft), [draft]);
  const visibleErrors = useMemo(
    () => Object.fromEntries(Object.entries(allErrors).filter(([field]) => touched.has(field as keyof PasswordDraft))),
    [allErrors, touched],
  );

  const onChange = (field: keyof PasswordDraft, value: string) => {
    setDone(false);
    change.clear();
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const onBlur = (field: keyof PasswordDraft) => setTouched((current) => new Set(current).add(field));

  const onSubmit = async () => {
    if (!isPasswordDraftReady(draft)) return;
    const result = await change.run({ currentPassword: draft.current, newPassword: draft.next });
    if (result === undefined) return;
    // Secrets leave state as soon as the server confirmed.
    setDraft(EMPTY_PASSWORD_DRAFT);
    setTouched(new Set());
    setDone(true);
  };

  const needsReauth = stepUp.recentAuthFor(change.failure).required;

  return (
    <div className="space-y-3">
      {stepUp.resumed && <Notice tone="info">{t("account.security.resumed")}</Notice>}
      <PasswordForm
        draft={draft}
        errors={visibleErrors}
        ready={isPasswordDraftReady(draft)}
        pending={change.pending}
        serverError={needsReauth ? undefined : change.error}
        success={done}
        needsReauth={needsReauth}
        onChange={onChange}
        onBlur={onBlur}
        onSubmit={() => void onSubmit()}
        onReauthenticate={stepUp.onReauthenticate}
      />
    </div>
  );
}
