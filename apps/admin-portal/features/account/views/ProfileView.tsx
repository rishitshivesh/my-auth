"use client";

import { useMemo, useState } from "react";
import { useCopy } from "@/i18n";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { accountApi } from "../api/account-api";
import { useProfileQuery, useRefresh } from "../api/use-account-queries";
import { useAsyncAction } from "../api/use-async-action";
import { ProfileForm } from "../components/ProfileForm";
import { queryStatus, ResourceBoundary } from "../components/ResourceBoundary";
import { toDraft, toUpdate, validateProfile, type ProfileDraft, type ProfileField } from "../model/profile";
import { PageFrame } from "@/components/page/PageFrame";

export function ProfileView() {
  const { t } = useCopy();
  const query = useProfileQuery();
  const refresh = useRefresh();
  const save = useAsyncAction(accountApi.updateProfile);
  const [edits, setEdits] = useState<Partial<ProfileDraft>>({});
  const [saved, setSaved] = useState(false);

  const profile = query.data;
  const initial = useMemo(() => (profile ? toDraft(profile) : null), [profile]);
  const draft = useMemo(() => (initial ? { ...initial, ...edits } : null), [initial, edits]);
  const dirty = useUnsavedChanges(initial, draft);
  const errors = useMemo(() => (draft ? validateProfile(draft) : {}), [draft]);

  const onChange = (field: ProfileField, value: string) => {
    setSaved(false);
    save.clear();
    setEdits((current) => ({ ...current, [field]: value }));
  };
  const onSave = async () => {
    if (!initial || !draft || Object.keys(errors).length > 0) return;
    const update = toUpdate(initial, draft);
    if (Object.keys(update).length === 0) {
      // TODO(gap:Profile response shape): the API cannot clear a field, so emptied fields are not sent.
      setEdits({});
      return;
    }
    const result = await save.run(update);
    if (result === undefined) return;
    await refresh("profile");
    setEdits({});
    setSaved(true);
  };
  const onDiscard = () => {
    setEdits({});
    setSaved(false);
    save.clear();
  };

  return (
    <PageFrame size="narrow" title={t("account.profile.title")} subtitle={t("account.profile.description")}>
      <ResourceBoundary
        status={queryStatus(query)}
        loadingTitle={t("account.profile.loading")}
        errorTitle={t("account.profile.loadFailed")}
        retryLabel={t("common.actions.retry")}
        onRetry={() => void query.refetch()}
      >
        {profile && draft && (
          <ProfileForm
            draft={draft}
            email={profile.email}
            emailVerified={profile.emailVerified}
            errors={errors}
            dirty={dirty}
            pending={save.pending}
            serverError={save.error ? `${t("account.profile.saveFailed")} ${save.error}` : undefined}
            savedMessage={saved ? t("account.profile.saved") : undefined}
            onChange={onChange}
            onSave={() => void onSave()}
            onDiscard={onDiscard}
          />
        )}
      </ResourceBoundary>
    </PageFrame>
  );
}
