"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, PageHeader, ResourceTable, SentryButton } from "@repo/ui";
import { SelectField } from "@/components/page/SelectField";
import { useCopy } from "@/i18n";
import { formatTimestamp } from "@/lib/format";
import { statusFromQuery } from "@/lib/resource-status";
import { usePlatformActivity } from "../api/admin";
import { ACTIVITY_LIMITS, DEFAULT_ACTIVITY_LIMIT, SEVERITIES, actorLabel, filterActivity } from "../model/activity";
import type { ActivityItem } from "../model/types";

export function ActivityView() {
  const { t } = useCopy();
  const [limit, setLimit] = useState<number>(DEFAULT_ACTIVITY_LIMIT);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const query = usePlatformActivity(limit);
  const loaded = query.data ?? [];
  const rows = filterActivity(loaded, search, severity);
  const unknown = t("platform.common.unknownActor");
  const none = t("platform.common.none");
  const retry = { label: t("platform.common.retry"), onClick: () => { void query.refetch(); } };
  const clear = () => { setSearch(""); setSeverity(""); };

  return (
    <div className="space-y-6">
      <PageHeader title={t("platform.audit.title")} subtitle={t("platform.audit.subtitle")} className="mb-0" />
      <p className="font-body text-xs text-muted-foreground">{t("platform.audit.note")}</p>
      <ResourceTable<ActivityItem>
        columns={[
          { header: t("platform.audit.columns.event"), accessorKey: (r) => <span className="font-mono text-xs">{r.eventType}</span> },
          { header: t("platform.audit.columns.actor"), accessorKey: (r) => actorLabel(r, unknown) },
          { header: t("platform.audit.columns.workspace"), accessorKey: (r) => <span className="font-mono text-xs">{r.tenantId ?? none}</span> },
          { header: t("platform.audit.columns.severity"), accessorKey: "severity" },
          { header: t("platform.audit.columns.time"), accessorKey: (r) => formatTimestamp(r.createdAt) },
        ]}
        rows={rows}
        status={statusFromQuery(query)}
        isFiltered={Boolean(search.trim() || severity)}
        isRefreshing={query.isFetching && !query.isPending}
        searchValue={search}
        onSearchChange={setSearch}
        rowActions={(r) => [{ id: "details", label: t("platform.audit.detail", { event: r.eventType }), onSelect: () => setSelected(r) }]}
        filters={
          <>
            <SelectField
              label={t("platform.audit.severity")}
              value={severity}
              onChange={setSeverity}
              options={[{ value: "", label: t("platform.audit.allSeverities") }, ...SEVERITIES.map((s) => ({ value: s, label: s }))]}
            />
            <SelectField
              label={t("platform.audit.limit")}
              value={String(limit)}
              onChange={(v) => setLimit(Number(v))}
              options={ACTIVITY_LIMITS.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </>
        }
        labels={{
          searchLabel: t("platform.audit.searchLabel"),
          searchPlaceholder: t("platform.audit.searchPlaceholder"),
          previous: "", next: "", pageStatus: "",
          rowActions: (r) => t("platform.tenants.rowActions", { name: r.eventType }),
          loading: { title: t("states.loading.title") },
          empty: { title: t("platform.audit.emptyTitle"), description: t("platform.audit.emptyBody") },
          filteredEmpty: { title: t("platform.audit.filteredTitle"), description: t("platform.audit.filteredBody"), clear: { label: t("platform.audit.clear"), onClick: clear } },
          error: { title: t("platform.common.errorTitle"), description: t("platform.common.errorBody"), retry },
          denied: { title: t("platform.common.deniedTitle"), description: t("platform.common.deniedBody") },
          unavailable: { title: t("platform.common.unavailableTitle"), description: t("platform.common.unavailableBody"), retry },
        }}
      />
      <p role="status" className="font-body text-sm text-muted-foreground">
        {query.data ? t("platform.audit.count", { shown: rows.length, loaded: loaded.length }) : ""}
      </p>
      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{t("platform.audit.detailTitle")}</DialogTitle>
                <DialogDescription className="font-mono">{selected.eventType}</DialogDescription>
              </DialogHeader>
              <dl className="space-y-2 font-body text-sm text-foreground">
                <div><dt className="text-xs text-muted-foreground">{t("platform.audit.actor")}</dt><dd>{actorLabel(selected, unknown)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("platform.audit.workspace")}</dt><dd className="font-mono">{selected.tenantId ?? none}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("platform.audit.ip")}</dt><dd className="font-mono">{selected.ipAddress ?? none}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("platform.audit.severityLabel")}</dt><dd>{selected.severity}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("platform.audit.time")}</dt><dd>{formatTimestamp(selected.createdAt)}</dd></div>
              </dl>
              <SentryButton variant="outline" onClick={() => setSelected(null)}>{t("platform.audit.close")}</SentryButton>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
