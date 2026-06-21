'use client';
// apps/admin-portal/lib/use-mfa-grace.ts
// Computes days remaining before MFA grace period expires.
// tenantSlug is passed as a parameter (not read from User — User has tenantId, not tenantSlug).

import { useAuth } from '@scrolloop/sdk';
import { useMfaStatus, useTenantSettings } from '@/lib/queries';

const GRACE_START_KEY = (userId: string) => `sentry_mfa_grace_start_${userId}`;

export function useMfaGrace(tenantSlug: string = '') {
  const { user, client } = useAuth();

  // Always call hooks unconditionally (React rules of hooks)
  const { data: mfaStatus } = useMfaStatus();
  const { data: tenantSettings } = useTenantSettings();

  // SSR guard — return safe defaults before client-side localStorage is available
  if (typeof window === 'undefined' || !user) {
    return { shouldNudge: false, daysRemaining: 7, isExpired: false };
  }

  // Read per-tenant grace days from DB feature flags (configured by admin/superadmin)
  let graceDays = 7;
  if (tenantSettings?.featureFlags) {
    if (tenantSettings.featureFlags.mfa_grace_1d) graceDays = 1;
    else if (tenantSettings.featureFlags.mfa_grace_3d) graceDays = 3;
    else if (tenantSettings.featureFlags.mfa_grace_5d) graceDays = 5;
    else if (tenantSettings.featureFlags.mfa_grace_7d) graceDays = 7;
    else if (tenantSettings.featureFlags.mfa_grace_14d) graceDays = 14;
  }

  // Superadmins have MFA mandatory in 7 days at max
  if (client && client.isSentryInternal && client.isSentryInternal()) {
    graceDays = Math.min(graceDays, 7);
  }


  const mfaEnabled = mfaStatus?.enabled ?? false;

  // If MFA is already enabled, clear any stale grace timer and stop nudging
  if (mfaEnabled) {
    localStorage.removeItem(GRACE_START_KEY(user.id));
    return { shouldNudge: false, daysRemaining: graceDays, isExpired: false };
  }

  // Start or resume grace timer
  const stored = localStorage.getItem(GRACE_START_KEY(user.id));
  let graceStart: Date;

  if (stored) {
    graceStart = new Date(stored);
  } else {
    graceStart = new Date();
    localStorage.setItem(GRACE_START_KEY(user.id), graceStart.toISOString());
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsed = Math.floor((Date.now() - graceStart.getTime()) / msPerDay);
  const daysRemaining = Math.max(0, graceDays - elapsed);
  const isExpired = daysRemaining === 0;

  return { shouldNudge: true, daysRemaining, isExpired };
}
