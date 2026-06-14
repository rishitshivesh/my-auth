'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, SentryInput, DataTable, StatusBadge, AuditTimeline } from "@repo/ui";

import { useTenantActivity } from '@/lib/queries';
import { Download, Search, Filter, Shield, Clock, MapPin, Monitor } from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLogPage() {
  const [search, setSearch] = React.useState('');
  const { data: activity, isLoading } = useTenantActivity(50);

  const columns = [
    {
      header: 'Event',
      accessorKey: (row: any) => (
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
      accessorKey: (row: any) => (
        <span className="text-xs font-body text-foreground">
          {row.actorEmail || 'System'}
        </span>
      ),
    },
    {
      header: 'Location',
      accessorKey: (row: any) => (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span className="text-xs font-body">{row.location || 'Unknown'}</span>
        </div>
      ),
    },
    {
      header: 'IP Address',
      accessorKey: (row: any) => (
        <code className="text-[11px] font-mono text-muted-foreground bg-black/5 px-1.5 py-0.5 rounded-sm">
          {row.ipAddress}
        </code>
      ),
    },
    {
      header: 'Timestamp',
      accessorKey: (row: any) => (
        <span className="text-xs font-body text-muted-foreground whitespace-nowrap">
          {format(new Date(row.createdAt), 'MMM dd, HH:mm:ss')}
        </span>
      ),
    },
    {
      header: 'Severity',
      accessorKey: (row: any) => (
        <StatusBadge status={row.severity === 'critical' ? 'suspended' : row.severity === 'warning' ? 'pending' : 'active'}>
          {row.severity}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PortalLayout>
      <div className="space-y-10">
        <PageHeader
          title="Security Audit Log"
          subtitle="A comprehensive record of all activities within your workspace"
          action={
            <SentryButton variant="ghost" className="gap-2 border-border">
              <Download className="w-4 h-4" />
              Export Logs
            </SentryButton>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-4">
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                 <SentryInput
                   placeholder="Filter by event type, actor, or IP..."
                   className="pl-9 bg-black/5 border-transparent focus:bg-white"
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                 />
               </div>
               <SentryButton variant="ghost" className="gap-2 h-[42px] border-border">
                 <Filter className="w-3.5 h-3.5" />
                 More Filters
               </SentryButton>
            </div>

            <DataTable
              columns={columns}
              data={activity || []}
              isLoading={isLoading}
            />
          </div>

          <div className="space-y-6">
            <h2 className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60 mb-4">
              Real-time Pulse
            </h2>
            <GlassCard tier={1} className="p-6">
               <AuditTimeline 
                 events={activity?.slice(0, 8).map(a => ({
                   id: a.id,
                   type: a.eventType,
                   description: `${a.actorEmail || 'System'} accessed via ${a.ipAddress}`,
                   timestamp: a.createdAt,
                 })) || []} 
               />
            </GlassCard>
            
            <div className="p-4 rounded-sm bg-accent/5 border border-accent/10">
              <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
                <span className="font-display font-bold text-accent uppercase tracking-wider">Note:</span> Audit logs are retained for 365 days on your current plan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
