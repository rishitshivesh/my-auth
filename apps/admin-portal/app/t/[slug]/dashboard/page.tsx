'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { GlassCard, PageHeader, SentryButton, AuditTimeline, SentrySkeleton } from "@repo/ui";

import {
  useTenantMetrics,
  useTenantActivity,
  useApiCallTrend,
} from '@/lib/queries';
import { useParams, useRouter } from 'next/navigation';
import { 
  Users, 
  Activity, 
  AppWindow, 
  ShieldCheck,
  Plus,
  Settings,
  History,
  TrendingUp,
  ArrowUpRight
} from 'lucide-react';

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const { data: metrics, isLoading: metricsLoading } = useTenantMetrics();
  const { data: activity, isLoading: activityLoading } = useTenantActivity(5);
  const { data: trend, isLoading: trendLoading } = useApiCallTrend(7);

  const stats = [
    {
      label: 'Total Users',
      value: metrics?.totalUsers.toLocaleString(),
      icon: Users,
      trend: '+12%',
    },
    {
      label: 'Active Sessions',
      value: metrics?.activeSessions.toLocaleString(),
      icon: Activity,
      trend: '+4%',
    },
    {
      label: 'Applications',
      value: metrics?.totalApplications.toLocaleString(),
      icon: AppWindow,
    },
    {
      label: 'MFA Adoption',
      value: metrics ? `${Math.round(metrics.mfaAdoptionRate * 100)}%` : undefined,
      icon: ShieldCheck,
      trend: '+2.4%',
    },
  ];

  return (
    <PortalLayout
      pageTitle="Platform Dashboard"
      pageSubtitle="Overview of your Sentry workspace"
    >
      <div className="space-y-10">
        {/* Stat Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <GlassCard
              key={stat.label}
              tier={1}
              className="p-6 flex flex-col justify-between min-h-[140px] animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-sm bg-black/5">
                  <stat.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                {stat.trend && (
                  <span className="text-[10px] font-display font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-sm flex items-center gap-0.5">
                    <TrendingUp className="w-2.5 h-2.5" />
                    {stat.trend}
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-1">
                <p className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                  {stat.label}
                </p>
                {metricsLoading ? (
                  <SentrySkeleton className="h-8 w-20" />
                ) : (
                  <p className="text-2xl font-display font-semibold text-foreground tracking-tight">
                    {stat.value ?? '0'}
                  </p>
                )}
              </div>
            </GlassCard>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Chart Area */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-display font-bold uppercase tracking-[0.1em] text-muted-foreground">
                API Traffic Trend
              </h2>
              <SentryButton variant="ghost" size="sm" className="h-8 text-[11px]">
                Last 7 Days
              </SentryButton>
            </div>
            
            <GlassCard tier={1} className="p-8 h-[320px] flex flex-col">
              {trendLoading ? (
                <SentrySkeleton className="flex-1 w-full" />
              ) : (
                <div className="flex-1 relative mt-4">
                  {/* SVG Chart Implementation */}
                  <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <defs>
                      <linearGradient id="mintGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={generatePath(trend ?? [], 100, 100)}
                      fill="url(#mintGradient)"
                      className="animate-fade-in"
                    />
                    <path
                      d={generatePath(trend ?? [], 100, 100, true)}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-fade-in"
                    />
                  </svg>
                  
                  {(!trend || trend.length === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-xs font-body text-muted-foreground">No data available for this period</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between mt-4">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <span key={day} className="text-[10px] font-display font-bold text-muted-foreground/40 uppercase">
                    {day}
                  </span>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Activity Feed */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-display font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Recent Security Events
              </h2>
              <SentryButton 
                variant="ghost" 
                size="sm" 
                className="h-8 text-[11px]"
                onClick={() => router.push(`/t/${slug}/audit`)}
              >
                View Log
              </SentryButton>
            </div>

            <GlassCard tier={1} className="p-6 h-[320px] overflow-y-auto scrollbar-hide">
              {activityLoading ? (
                <div className="space-y-6">
                  <SentrySkeleton className="h-12 w-full" />
                  <SentrySkeleton className="h-12 w-full" />
                  <SentrySkeleton className="h-12 w-full" />
                </div>
              ) : activity && activity.length > 0 ? (
                <AuditTimeline 
                  events={activity.map(a => ({
                    id: a.id,
                    type: a.eventType,
                    description: `${a.actorEmail || 'System'} from ${a.ipAddress}`,
                    timestamp: a.createdAt,
                  }))} 
                />
              ) : (
                <div className="h-full flex items-center justify-center text-center p-4">
                  <p className="text-xs font-body text-muted-foreground">
                    No security events recorded in the last 24 hours.
                  </p>
                </div>
              )}
            </GlassCard>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="pt-4 border-t border-border/50">
          <h2 className="text-[10px] font-display font-bold uppercase tracking-[0.15em] text-muted-foreground/40 mb-6">
            Recommended Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickActionCard 
              icon={Plus} 
              title="Add Application" 
              desc="Integrate Sentry with a new service"
              href={`/t/${slug}/applications/new`}
            />
            <QuickActionCard 
              icon={Users} 
              title="Invite Team" 
              desc="Add administrators to this workspace"
              href={`/t/${slug}/users`}
            />
            <QuickActionCard 
              icon={Settings} 
              title="Configure MFA" 
              desc="Enforce multi-factor auth for users"
              href={`/t/${slug}/security`}
            />
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

function QuickActionCard({ icon: Icon, title, desc, href }: any) {
  return (
    <button className="group text-left focus:outline-none">
      <GlassCard tier={1} className="p-5 flex items-start gap-4 group-hover:border-accent/30 group-hover:bg-accent/[0.02] transition-all">
        <div className="p-2.5 rounded-sm bg-black/5 group-hover:bg-accent/10 transition-colors">
          <Icon className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
        </div>
        <div className="space-y-0.5">
          <h4 className="text-sm font-display font-semibold group-hover:text-accent transition-colors">
            {title}
          </h4>
          <p className="text-[11px] font-body text-muted-foreground leading-snug">
            {desc}
          </p>
        </div>
        <ArrowUpRight className="w-3 h-3 text-muted-foreground/20 ml-auto group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
      </GlassCard>
    </button>
  );
}

function generatePath(points: any[], w: number, h: number, lineOnly = false) {
  if (!points || points.length < 2) return '';
  const max = Math.max(...points.map(p => p.count), 1);
  const step = w / (points.length - 1);
  
  const coords = points.map((p, i) => ({
    x: i * step,
    y: h - (p.count / max) * h * 0.8 - (h * 0.1)
  }));

  if (coords.length === 0 || !coords[0]) return '';

  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i-1];
    const curr = coords[i];
    if (!prev || !curr) continue;
    const cp1x = prev.x + (curr.x - prev.x) / 2;
    d += ` C ${cp1x} ${prev.y}, ${cp1x} ${curr.y}, ${curr.x} ${curr.y}`;
  }


  if (lineOnly) return d;
  
  return d + ` L ${w} ${h} L 0 ${h} Z`;
}
