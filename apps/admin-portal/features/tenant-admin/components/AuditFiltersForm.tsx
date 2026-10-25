"use client";

import { FormField, SentryButton, SentryInput } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { AuditFilterErrors, AuditFilters } from "../model/audit";

export interface AuditFiltersFormProps {
  value: AuditFilters;
  errors: AuditFilterErrors;
  expanded: boolean;
  onChange: (next: AuditFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onToggleExpanded: () => void;
}

export function AuditFiltersForm({ value, errors, expanded, onChange, onApply, onClear, onToggleExpanded }: AuditFiltersFormProps) {
  const { t } = useCopy();
  const set = (key: keyof AuditFilters) => (event: { target: { value: string } }) =>
    onChange({ ...value, [key]: event.target.value });
  const err = (key: keyof AuditFilters) => (errors[key] ? t(`tenantAdmin.audit.errors.${errors[key]}`) : undefined);

  return (
    <form
      role="search"
      aria-label={t("tenantAdmin.audit.filtersHeading")}
      onSubmit={(event) => { event.preventDefault(); onApply(); }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label={t("tenantAdmin.audit.filters.eventType")} hint={t("tenantAdmin.audit.filters.eventTypeHint")}>
          {(c) => <SentryInput {...c} value={value.eventType} onChange={set("eventType")} autoComplete="off" spellCheck={false} />}
        </FormField>
        <FormField label={t("tenantAdmin.audit.filters.startDate")}>
          {(c) => <SentryInput {...c} type="date" value={value.startDate} onChange={set("startDate")} />}
        </FormField>
        <FormField label={t("tenantAdmin.audit.filters.endDate")} error={err("endDate")}>
          {(c) => <SentryInput {...c} type="date" value={value.endDate} onChange={set("endDate")} />}
        </FormField>
      </div>
      {expanded && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("tenantAdmin.audit.filters.userId")}>
            {(c) => <SentryInput {...c} value={value.userId} onChange={set("userId")} autoComplete="off" spellCheck={false} className="font-mono" />}
          </FormField>
          <FormField label={t("tenantAdmin.audit.filters.requestId")} error={err("requestId")}>
            {(c) => <SentryInput {...c} value={value.requestId} onChange={set("requestId")} autoComplete="off" spellCheck={false} className="font-mono" />}
          </FormField>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <SentryButton type="submit" disabled={Object.keys(errors).length > 0}>{t("tenantAdmin.audit.filters.apply")}</SentryButton>
        <SentryButton type="button" variant="outline" aria-expanded={expanded} onClick={onToggleExpanded}>
          {expanded ? t("tenantAdmin.audit.filters.fewer") : t("tenantAdmin.audit.filters.more")}
        </SentryButton>
        <SentryButton type="button" variant="ghost" onClick={onClear}>{t("tenantAdmin.audit.filters.clear")}</SentryButton>
      </div>
    </form>
  );
}
