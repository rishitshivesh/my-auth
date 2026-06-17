"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SentryAuthFlow } from "@/components/auth/SentryAuthFlow";
import { AuthLayout } from "@/components/layouts/AuthLayout";
import { useAuth } from "@scrolloop/sdk";
import type { User } from "@scrolloop/sdk";
import { authClient } from "@/app/layout";

function getPostLoginRoute(user: User | null): string {
  if (!user) return '/u/login'
  const claims = authClient.getTokenClaims()
  const sentryTenantId = process.env.NEXT_PUBLIC_SENTRY_TENANT_ID
  const isSentry = sentryTenantId
    ? claims?.tenantId === sentryTenantId
    : claims?.tenantSlug === 'sentry'
  const isInternal = Array.isArray(claims?.groups) &&
    claims.groups.includes('sentry-internal')
  if (isSentry && isInternal) return '/dashboard'
  const slug = claims?.tenantSlug ?? ''
  return slug ? `/t/${slug}/dashboard` : '/u/login'
}

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getPostLoginRoute(user));
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-black/5 rounded-sm" />
          <div className="h-4 w-64 bg-black/5 rounded-sm" />
          <div className="space-y-4 pt-4">
            <div className="h-10 bg-black/5 rounded-sm" />
            <div className="h-10 bg-black/5 rounded-sm" />
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (user) return null; // redirect in progress

  return (
    <AuthLayout>
      <SentryAuthFlow />
    </AuthLayout>
  );
}

