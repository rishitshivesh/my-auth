'use client';

import * as React from 'react';
import { Sidebar } from '../portal/sidebar';
import { Topbar } from '../portal/topbar';
import { cn } from "@repo/ui/lib/utils";

import { useParams, usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  ShieldAlert, 
  Settings, 
  Key, 
  History,
  AppWindow,
  Globe
} from 'lucide-react';

interface PortalLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  tenantSlug?: string;
  currentPath?: string;
  primaryAction?: { label: string; onClick: () => void | Promise<void> };
  secondaryActions?: { label: string; onClick: () => void }[];
}

export function PortalLayout({
  children,
  pageTitle,
  pageSubtitle,
  tenantSlug,
  currentPath,
  primaryAction,
  secondaryActions,
}: PortalLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const slug = (params.slug as string) || tenantSlug;

  const tenants = [
    { id: '1', name: slug || 'Default Workspace', slug: slug || 'default' }
  ];



  const navigation = [
    {
      label: 'Platform',
      items: [
        { label: 'Dashboard', href: `/t/${slug}/dashboard`, icon: LayoutDashboard },
        { label: 'Users', href: `/t/${slug}/users`, icon: Users },
        { label: 'RBAC', href: `/t/${slug}/roles`, icon: ShieldAlert },
      ]
    },
    {
      label: 'Configure',
      items: [
        { label: 'Applications', href: `/t/${slug}/applications`, icon: AppWindow },
        { label: 'Connections', href: `/t/${slug}/connections`, icon: Globe },
        { label: 'API Keys', href: `/t/${slug}/clients`, icon: Key },
        { label: 'Audit Log', href: `/t/${slug}/audit`, icon: History },
      ]
    },
    {
      label: 'Account',
      items: [
        { label: 'Settings', href: `/t/${slug}/settings`, icon: Settings },
      ]
    }
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar navigation={navigation} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={pageTitle} subtitle={pageSubtitle} tenants={tenants} current={tenants[0]?.id} />

        <main className="flex-1 overflow-y-auto overflow-x-hidden">

          <div className="p-8 max-w-[1440px] mx-auto animate-fade-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
