"use client";

import { useState } from "react";
import { PageHeader } from "@repo/ui";
import { PageState } from "@/components/page/PageState";
import { usePermission } from "@/hooks/use-permission";
import { useCopy } from "@/i18n";
import { errorText, statusFromQuery } from "@/lib/resource-status";
import { useAllowedOrigins, usePasswordPolicy, useSaveAllowedOrigins, useSavePasswordPolicy } from "../api/security";
import { OriginsEditor } from "../components/OriginsEditor";
import { PasswordPolicyForm } from "../components/PasswordPolicyForm";
import { tenantStateLabels } from "../components/state-labels";
import { fromDraft, toDraft, type PolicyDraft } from "../model/password-policy";

function PasswordPolicySection({ slug, readOnly }: { slug: string; readOnly: boolean }) {
  const { t } = useCopy();
  const query = usePasswordPolicy(slug);
  const save = useSavePasswordPolicy(slug);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const status = statusFromQuery(query);
  if (status !== "ready" || !query.data) {
    return <PageState status={status === "ready" ? "loading" : status} labels={tenantStateLabels(t)} onRetry={() => { void query.refetch(); }} />;
  }
  const current = draft ?? toDraft(query.data);
  return (
    <PasswordPolicyForm
      saved={query.data}
      draft={current}
      readOnly={readOnly}
      pending={save.isPending}
      error={errorText(save.error)}
      savedMessage={save.isSuccess ? t("tenantAdmin.security.password.saved") : undefined}
      onChange={setDraft}
      onSave={() => save.mutate(fromDraft(current), { onSuccess: () => setDraft(null) })}
      onDiscard={() => { setDraft(null); save.reset(); }}
    />
  );
}

function OriginsSection({ slug, readOnly }: { slug: string; readOnly: boolean }) {
  const { t } = useCopy();
  const query = useAllowedOrigins(slug);
  const save = useSaveAllowedOrigins(slug);
  const [draft, setDraft] = useState<string[] | null>(null);
  const status = statusFromQuery(query);
  if (status !== "ready" || !query.data) {
    return <PageState status={status === "ready" ? "loading" : status} labels={tenantStateLabels(t)} onRetry={() => { void query.refetch(); }} />;
  }
  const current = draft ?? query.data.origins;
  return (
    <OriginsEditor
      saved={query.data.origins}
      draft={current}
      readOnly={readOnly}
      pending={save.isPending}
      error={errorText(save.error)}
      savedMessage={save.isSuccess ? t("tenantAdmin.security.origins.saved") : undefined}
      onChange={setDraft}
      onSave={() => save.mutate(current, { onSuccess: () => setDraft(null) })}
      onDiscard={() => { setDraft(null); save.reset(); }}
    />
  );
}

export function SecurityPolicyView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const readOnly = isReady && !can("tenant:write");
  return (
    <div className="space-y-6">
      <PageHeader title={t("tenantAdmin.security.title")} subtitle={t("tenantAdmin.security.subtitle")} />
      <PasswordPolicySection slug={slug} readOnly={readOnly} />
      <OriginsSection slug={slug} readOnly={readOnly} />
      <section aria-labelledby="security-gap" className="space-y-1 rounded-md border border-dashed border-border p-4">
        <h2 id="security-gap" className="font-display text-sm font-semibold text-foreground">{t("tenantAdmin.security.gap.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.security.gap.note")}</p>
      </section>
    </div>
  );
}
