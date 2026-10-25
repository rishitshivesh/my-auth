"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader, ResourceTable, SentryButton, StatusBadge } from "@repo/ui";
import { SelectField } from "@/components/page/SelectField";
import { platformRoutes } from "@/constants/routes";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCopy } from "@/i18n";
import { formatDate } from "@/lib/format";
import { statusFromQuery } from "@/lib/resource-status";
import { useTenants } from "../api/admin";
import { PLANS, STATUS_FILTERS, hasTenantFilters, pageCount, type TenantsQuery } from "../model/tenants";
import type { TenantListItem } from "../model/types";

export function TenantsView() {
  const { t } = useCopy();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const query: TenantsQuery = { search: debounced, status, plan, page };
  const result = useTenants(query);
  const total = result.data?.total ?? 0;
  const retry = { label: t("platform.common.retry"), onClick: () => { void result.refetch(); } };
  const reset = () => { setSearch(""); setStatus(""); setPlan(""); setPage(1); };
  const filtered = hasTenantFilters(query);
  const open = (row: TenantListItem) => router.push(platformRoutes.tenant(row.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("platform.tenants.title")}
        subtitle={t("platform.tenants.subtitle")}
        className="mb-0 flex-wrap"
        action={
          <SentryButton asChild>
            <Link href={platformRoutes.newTenant()}>{t("platform.tenants.new")}</Link>
          </SentryButton>
        }
      />
      <ResourceTable<TenantListItem>
        columns={[
          { header: t("platform.tenants.columns.name"), accessorKey: "name" },
          { header: t("platform.tenants.columns.slug"), accessorKey: (r) => <span className="font-mono text-xs">{r.slug}</span> },
          { header: t("platform.tenants.columns.plan"), accessorKey: "plan" },
          {
            header: t("platform.tenants.columns.status"),
            accessorKey: (r) => (
              <StatusBadge status={r.status === "active" ? "active" : "suspended"}>
                {r.status === "active" ? t("platform.tenants.statusValue.active") : t("platform.tenants.statusValue.suspended")}
              </StatusBadge>
            ),
          },
          { header: t("platform.tenants.columns.people"), accessorKey: "userCount" },
          { header: t("platform.tenants.columns.created"), accessorKey: (r) => formatDate(r.createdAt) },
        ]}
        rows={result.data?.tenants ?? []}
        status={statusFromQuery(result)}
        isRefreshing={result.isFetching && !result.isPending}
        isFiltered={filtered}
        searchValue={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        rowActions={(row) => [{ id: "open", label: t("platform.tenants.open"), onSelect: () => open(row) }]}
        onRowClick={open}
        filters={
          <>
            <SelectField
              label={t("platform.tenants.status")}
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[{ value: "", label: t("platform.tenants.allStatuses") }, ...STATUS_FILTERS.map((s) => ({ value: s, label: t(`platform.tenants.statusValue.${s}`) }))]}
            />
            <SelectField
              label={t("platform.tenants.plan")}
              value={plan}
              hint={t("platform.tenants.planNote")}
              onChange={(v) => { setPlan(v); setPage(1); }}
              options={[{ value: "", label: t("platform.tenants.allPlans") }, ...PLANS.map((p) => ({ value: p, label: t(`platform.newTenant.plans.${p}`) }))]}
            />
          </>
        }
        pagination={{
          page,
          hasPrevious: page > 1,
          hasNext: page < pageCount(total),
          onPrevious: () => setPage((p) => Math.max(1, p - 1)),
          onNext: () => setPage((p) => p + 1),
        }}
        labels={{
          searchLabel: t("platform.tenants.searchLabel"),
          searchPlaceholder: t("platform.tenants.searchPlaceholder"),
          previous: t("platform.tenants.previous"),
          next: t("platform.tenants.next"),
          pageStatus: t("platform.tenants.pageStatus", { page, total: pageCount(total) }),
          rowActions: (row) => t("platform.tenants.rowActions", { name: row.name }),
          loading: { title: t("states.loading.title") },
          empty: { title: t("platform.tenants.emptyTitle"), description: t("platform.tenants.emptyBody") },
          filteredEmpty: { title: t("platform.tenants.filteredTitle"), description: t("platform.tenants.filteredBody"), clear: { label: t("platform.tenants.clearFilters"), onClick: reset } },
          error: { title: t("platform.common.errorTitle"), description: t("platform.common.errorBody"), retry },
          denied: { title: t("platform.common.deniedTitle"), description: t("platform.common.deniedBody") },
          unavailable: { title: t("platform.common.unavailableTitle"), description: t("platform.common.unavailableBody"), retry },
        }}
      />
      <p role="status" className="font-body text-sm text-muted-foreground">{result.data ? t("platform.tenants.count", { count: total }) : ""}</p>
    </div>
  );
}
