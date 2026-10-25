"use client";

import { useState } from "react";
import { FormField, SentryInput, SettingsSection } from "@repo/ui";
import { SelectField } from "@/components/page/SelectField";
import { useCopy } from "@/i18n";
import { errorText } from "@/lib/resource-status";
import { useUpdateTenant } from "../api/admin";
import { NAME_MAX, PLANS } from "../model/tenants";
import type { TenantDetail } from "../model/types";

export function TenantEditForm({ tenant }: { tenant: TenantDetail }) {
  const { t } = useCopy();
  const update = useUpdateTenant(tenant.id);
  const [name, setName] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const currentName = name ?? tenant.name;
  const currentPlan = plan ?? tenant.plan;
  const dirty = currentName !== tenant.name || currentPlan !== tenant.plan;
  const blank = !currentName.trim();
  const plans = PLANS.includes(currentPlan as (typeof PLANS)[number]) ? PLANS : [...PLANS, currentPlan];

  return (
    <SettingsSection
      title={t("platform.tenantDetail.edit.title")}
      dirty={dirty}
      invalid={blank}
      pending={update.isPending}
      error={errorText(update.error)}
      savedMessage={update.isSuccess ? t("platform.tenantDetail.edit.saved") : undefined}
      saveLabel={t("platform.tenantDetail.edit.save")}
      discardLabel={t("platform.tenantDetail.edit.discard")}
      onDiscard={() => { setName(null); setPlan(null); update.reset(); }}
      onSave={() => update.mutate({ name: currentName.trim(), plan: currentPlan }, { onSuccess: () => { setName(null); setPlan(null); } })}
    >
      <FormField label={t("platform.tenantDetail.edit.name")} required error={blank ? t("platform.newTenant.errors.required") : currentName.length > NAME_MAX ? t("platform.newTenant.errors.tooLong") : undefined}>
        {(c) => <SentryInput {...c} value={currentName} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />}
      </FormField>
      <SelectField
        label={t("platform.tenantDetail.edit.plan")}
        hint={t("platform.tenants.planNote")}
        value={currentPlan}
        onChange={setPlan}
        options={plans.map((p) => ({ value: p, label: p }))}
      />
    </SettingsSection>
  );
}
