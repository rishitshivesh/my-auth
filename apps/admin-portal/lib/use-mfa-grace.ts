'use client';
// apps/admin-portal/lib/use-mfa-grace.ts
// Reads MFA grace period state from the server — never derived from client storage.
// The backend sets mfa_grace_started_at on first login; this hook only displays it.

import { useAuth } from '@scrolloop/sdk';
import { useMfaStatus } from '@/lib/queries';

export function useMfaGrace(_tenantSlug: string = '') {
  const { user } = useAuth();
  const { data: mfaStatus } = useMfaStatus();

  if (!user || !mfaStatus) {
    return { shouldNudge: false, daysRemaining: 7, isExpired: false };
  }

  if (mfaStatus.enabled) {
    return { shouldNudge: false, daysRemaining: 0, isExpired: false };
  }

  const grace = mfaStatus.grace;
  if (!grace?.startedAt) {
    // Grace period not yet started on server — treat as not nudging yet
    return { shouldNudge: false, daysRemaining: 7, isExpired: false };
  }

  return {
    shouldNudge: true,
    daysRemaining: grace.daysRemaining,
    isExpired: grace.isExpired,
  };
}
