'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { DataTable, StatusBadge } from '@repo/ui';
import { useAuditLogsInfinite, useExportAuditCsv } from '@/lib/queries';
import type { ActivityEvent } from '@/lib/types';
import { Download, Shield, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface AuditFilters {
  eventType: string;
  startDate: string;
  endDate: string;
}

export default function AuditLogPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [filters, setFilters] = React.useState<AuditFilters>({
    eventType: '',
    startDate: '',
    endDate: '',
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuditLogsInfinite({
      eventType: filters.eventType || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      limit: 50,
    });

  const exportCsv = useExportAuditCsv();

  const events: ActivityEvent[] =
    data?.pages.flatMap((page) => page.items) ?? [];

  const handleExport = () => {
    exportCsv.mutate({
      eventType: filters.eventType || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    });
  };

  const columns = [
    {
      header: 'Event',
      accessorKey: (row: ActivityEvent) => (
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-sm bg-black/5">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="font-display font-semibold text-xs tracking-tight uppercase">
            {row.eventType}
          </span>
        </div>
      ),
    },
    {
      header: 'Actor',
      accessorKey: (row: ActivityEvent) => (
        <span className="text-xs font-body text-foreground">
          {row.actorEmail || 'System'}
        </span>
      ),
    },
    {
      header: 'IP Address',
      accessorKey: (row: ActivityEvent) => (
        <code className="text-[11px] font-mono text-muted-foreground bg-black/5 px-1.5 py-0.5 rounded-sm">
          {row.ipAddress}
        </code>
      ),
    },
    {
      header: 'Timestamp',
      accessorKey: (row: ActivityEvent) => (
        <span className="text-xs font-body text-muted-foreground whitespace-nowrap">
          {format(new Date(row.createdAt), 'MMM dd, HH:mm:ss')}
        </span>
      ),
    },
    {
      header: 'Severity',
      accessorKey: (row: ActivityEvent) => (
        <StatusBadge
          status={
            row.severity === 'critical'
              ? 'suspended'
              : row.severity === 'warning'
              ? 'pending'
              : 'active'
          }
        >
          {row.severity}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="Audit Log"
      pageSubtitle="Security events and access history"
      currentPath={`/t/${slug}/audit`}
    >
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Event type
            </label>
            <input
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-transparent w-48"
              placeholder="e.g. LOGIN_SUCCESS"
              value={filters.eventType}
              onChange={(e) =>
                setFilters((f) => ({ ...f, eventType: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              From
            </label>
            <input
              type="date"
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-transparent"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, startDate: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              To
            </label>
            <input
              type="date"
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-transparent"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, endDate: e.target.value }))
              }
            />
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:border-[var(--color-accent)] transition-colors"
            onClick={handleExport}
            disabled={exportCsv.isPending}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {/* Events table */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading audit events...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No audit events found for these filters.
          </div>
        ) : (
          <>
            <DataTable columns={columns} data={events} />
            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <button
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
