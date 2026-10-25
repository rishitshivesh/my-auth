"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField, GlassCard, PageHeader, SentryButton, SentryInput } from "@repo/ui";
import { SelectField } from "@/components/page/SelectField";
import { ToggleRow } from "@/components/page/ToggleRow";
import { platformRoutes } from "@/constants/routes";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCopy } from "@/i18n";
import { errorText, isConflictError } from "@/lib/resource-status";
import { useCreateTenant, useSlugCheck } from "../api/admin";
import { PLANS, SLUG_PATTERN, slugify, validateNewTenant, type NewTenantDraft, type Plan } from "../model/tenants";
import type { TenantDetail } from "../model/types";

const INITIAL: NewTenantDraft = { name: "", slug: "", plan: "free", useCurrentUserAsAdmin: true };

export function NewTenantView() {
  const { t } = useCopy();
  const router = useRouter();
  const [draft, setDraft] = useState<NewTenantDraft>(INITIAL);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<TenantDetail | null>(null);
  const create = useCreateTenant();
  const debouncedSlug = useDebouncedValue(draft.slug);
  const slugCheck = useSlugCheck(debouncedSlug, SLUG_PATTERN.test(debouncedSlug));
  const errors = validateNewTenant(draft);
  const show = (key: "name" | "slug") => (submitted || (key === "slug" && slugTouched)) && errors[key];
  const slugText = slugCheck.data && !slugCheck.data.available && debouncedSlug === draft.slug ? slugCheck.data.reason : undefined;

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || slugText) return;
    create.mutate(draft, { onSuccess: setCreated });
  };

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("platform.newTenant.created.title")} subtitle={t("platform.newTenant.created.body", { name: created.name })} />
        <div className="flex flex-wrap gap-3">
          <SentryButton onClick={() => router.push(platformRoutes.tenant(created.id))}>{t("platform.newTenant.created.open")}</SentryButton>
          <SentryButton variant="outline" onClick={() => { setCreated(null); setDraft(INITIAL); setSubmitted(false); setSlugTouched(false); create.reset(); }}>
            {t("platform.newTenant.created.another")}
          </SentryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("platform.newTenant.title")} subtitle={t("platform.newTenant.subtitle")} />
      <GlassCard tier={1} className="p-6">
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <FormField label={t("platform.newTenant.fields.name")} required error={show("name") ? t(`platform.newTenant.errors.${errors.name ?? "required"}`) : undefined}>
            {(c) => (
              <SentryInput
                {...c}
                value={draft.name}
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: slugTouched ? draft.slug : slugify(e.target.value) })}
              />
            )}
          </FormField>
          <FormField
            label={t("platform.newTenant.fields.slug")}
            required
            hint={t("platform.newTenant.fields.slugHint")}
            error={show("slug") ? t(`platform.newTenant.errors.${errors.slug ?? "required"}`) : slugText}
          >
            {(c) => (
              <SentryInput
                {...c}
                value={draft.slug}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                onChange={(e) => { setSlugTouched(true); setDraft({ ...draft, slug: e.target.value.toLowerCase() }); }}
              />
            )}
          </FormField>
          <p role="status" className="font-body text-xs text-muted-foreground">
            {slugCheck.isFetching
              ? t("platform.newTenant.slugCheck.checking")
              : slugCheck.data?.available && debouncedSlug === draft.slug
                ? t("platform.newTenant.slugCheck.available", { slug: draft.slug })
                : ""}
          </p>
          <SelectField
            label={t("platform.newTenant.fields.plan")}
            value={draft.plan}
            onChange={(plan) => setDraft({ ...draft, plan: plan as Plan })}
            options={PLANS.map((p) => ({ value: p, label: t(`platform.newTenant.plans.${p}`) }))}
            hint={t("platform.tenants.planNote")}
          />
          <ToggleRow
            label={t("platform.newTenant.fields.admin")}
            hint={t("platform.newTenant.fields.adminHint")}
            checked={draft.useCurrentUserAsAdmin}
            onChange={(checked) => setDraft({ ...draft, useCurrentUserAsAdmin: checked })}
          />
          <p className="font-body text-xs text-muted-foreground">{t("platform.newTenant.ownerGap")}</p>
          {create.isError && (
            <div role="alert" className="space-y-1 rounded-sm border border-destructive p-3">
              <p className="font-display text-sm font-semibold text-destructive">{t("platform.newTenant.failedTitle")}</p>
              <p className="font-body text-sm text-foreground">{isConflictError(create.error) ? t("platform.newTenant.conflict") : errorText(create.error)}</p>
              <p className="font-body text-xs text-muted-foreground">{t("platform.newTenant.partialNote")}</p>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
            <SentryButton asChild variant="ghost"><Link href={platformRoutes.tenants()}>{t("platform.newTenant.cancel")}</Link></SentryButton>
            <SentryButton type="submit" isLoading={create.isPending}>
              {create.isPending ? t("platform.newTenant.submitting") : t("platform.newTenant.submit")}
            </SentryButton>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
