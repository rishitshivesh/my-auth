"use client";

import { useState } from "react";
import { GlassCard, PageHeader, SentryButton } from "@repo/ui";
import { ProposedCapabilityView } from "@/features/capabilities/views/ProposedCapabilityView";
import { usePermission } from "@/hooks/use-permission";
import { useCopy } from "@/i18n";
import { errorText, statusFromQuery } from "@/lib/resource-status";
import { useAuditEvents, useExportAudit } from "../api/audit";
import { AuditEventDialog } from "../components/AuditEventDialog";
import { AuditEventsTable } from "../components/AuditEventsTable";
import { AuditFiltersForm } from "../components/AuditFiltersForm";
import {
  EMPTY_AUDIT_FILTERS, hasActiveFilters, mergePages, validateAuditFilters, type AuditEvent, type AuditFilters,
} from "../model/audit";

export function AuditView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const query = useAuditEvents(slug, applied);
  const exporter = useExportAudit(slug);
  const errors = validateAuditFilters(draft);
  const pages = query.data?.pages ?? [];
  const events = mergePages(pages);
  const total = pages[pages.length - 1]?.total ?? 0;
  const canExport = !isReady || can("audit:export");

  const clear = () => {
    setDraft(EMPTY_AUDIT_FILTERS);
    setApplied(EMPTY_AUDIT_FILTERS);
    exporter.reset();
  };
  const apply = () => {
    if (Object.keys(errors).length === 0) {
      setApplied(draft);
      exporter.reset();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("tenantAdmin.audit.title")} subtitle={t("tenantAdmin.audit.subtitle")} />
      <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.audit.separateNote")}</p>
      <GlassCard tier={1} className="p-6">
        <AuditFiltersForm
          value={draft}
          errors={errors}
          expanded={expanded}
          onChange={setDraft}
          onApply={apply}
          onClear={clear}
          onToggleExpanded={() => setExpanded((open) => !open)}
        />
      </GlassCard>
      <AuditEventsTable
        events={events}
        total={total}
        status={statusFromQuery(query)}
        isFiltered={hasActiveFilters(applied)}
        hasMore={query.hasNextPage}
        isLoadingMore={query.isFetchingNextPage}
        onLoadMore={() => { void query.fetchNextPage(); }}
        onRetry={() => { void query.refetch(); }}
        onClearFilters={clear}
        onSelect={setSelected}
      />
      <section aria-labelledby="audit-export" className="space-y-2">
        <h2 id="audit-export" className="sr-only">{t("tenantAdmin.audit.export.action")}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <SentryButton disabled={!canExport} isLoading={exporter.isPending} onClick={() => exporter.mutate(applied)}>
            {exporter.isPending ? t("tenantAdmin.audit.export.working") : t("tenantAdmin.audit.export.action")}
          </SentryButton>
          <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.audit.export.note")}</p>
        </div>
        {!canExport && <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.audit.export.denied")}</p>}
        <p role="status" className="font-body text-sm text-success-text">{exporter.isSuccess ? t("tenantAdmin.audit.export.done") : ""}</p>
        {exporter.isError && (
          <p role="alert" className="font-body text-sm text-destructive">
            {t("tenantAdmin.audit.export.failed")} {errorText(exporter.error)}
          </p>
        )}
      </section>
      <AuditEventDialog event={selected} onClose={() => setSelected(null)} />
      <section aria-labelledby="audit-governance" className="space-y-3">
        <h2 id="audit-governance" className="font-display text-base font-semibold text-foreground">{t("tenantAdmin.audit.governance.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.audit.governance.note")}</p>
        <ProposedCapabilityView id="privacy" />
      </section>
    </div>
  );
}
