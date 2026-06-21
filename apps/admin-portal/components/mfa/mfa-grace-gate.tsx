'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useMfaGrace } from '@/lib/use-mfa-grace';

interface MfaGraceGateProps {
  tenantSlug: string;
  children: React.ReactNode;
}

export function MfaGraceGate({ tenantSlug, children }: MfaGraceGateProps) {
  const { isExpired } = useMfaGrace(tenantSlug);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const isSecurityPage = pathname === `/t/${tenantSlug}/security` || pathname.endsWith('/security');
    if (isExpired && !isSecurityPage) {
      router.replace(`/t/${tenantSlug}/security?mfa_required=1`);
    }
  }, [isExpired, tenantSlug, router, pathname]);

  return <>{children}</>;
}

