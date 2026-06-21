'use client';

import * as React from 'react';
import { Sidebar } from '../portal/sidebar';
import { Topbar } from '../portal/topbar';
import { cn } from "@repo/ui/lib/utils";

import { useParams, usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  ShieldAlert, 
  Settings, 
  Key, 
  History,
  AppWindow,
  Globe,
  Lock,
  Smartphone
} from 'lucide-react';
import { useMfaGrace } from '@/lib/use-mfa-grace';
import { MfaNudgeBanner } from '@/components/mfa/mfa-nudge-banner';
import { MfaGraceGate } from '@/components/mfa/mfa-grace-gate';
import { useAuth } from '@scrolloop/sdk';

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
  const router = useRouter();
  const slug = (params.slug as string) || tenantSlug || '';

  const { user } = useAuth();
  const { shouldNudge, daysRemaining, isExpired } = useMfaGrace(slug);

  React.useEffect(() => {
    if (user && !user.emailVerified) {
      router.replace('/u/verify-email');
    }
  }, [user, router]);

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
        { label: 'Security', href: `/t/${slug}/security`, icon: Lock },
        { label: 'MFA Devices', href: `/t/${slug}/security/devices`, icon: Smartphone },
        { label: 'Settings', href: `/t/${slug}/settings`, icon: Settings },
      ]
    }
  ];

  return (
    <MfaGraceGate tenantSlug={slug}>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar navigation={navigation} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar title={pageTitle} subtitle={pageSubtitle} />

          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-8 max-w-[1440px] mx-auto animate-fade-up">
              {shouldNudge && (
                <MfaNudgeBanner
                  daysRemaining={daysRemaining}
                  isExpired={isExpired}
                  tenantSlug={slug}
                />
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </MfaGraceGate>
  );
}

