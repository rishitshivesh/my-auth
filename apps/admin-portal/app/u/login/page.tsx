"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SentryAuthFlow } from "@/components/auth/SentryAuthFlow";
import { AuthLayout } from "@/components/layouts/AuthLayout";
import { useAuth } from "@fortknox/sdk";
import type { User } from "@fortknox/sdk";
import { authClient } from "@/app/layout";

function getPostLoginRoute(user: User | null): string {
  if (!user) return '/u/login'
  const claims = authClient.getTokenClaims()
  const fortknoxTenantId = process.env.NEXT_PUBLIC_FORTKNOX_TENANT_ID
  const isFortKnox = fortknoxTenantId
    ? claims?.tenantId === fortknoxTenantId
    : claims?.tenantSlug === 'fortknox'
  const isInternal = Array.isArray(claims?.groups) &&
    claims.groups.includes('fortknox-internal')
  if (isFortKnox && isInternal) return '/dashboard'
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

