'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SentryAuthFlow } from '@/components/auth/SentryAuthFlow';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { useAuth } from '@scrolloop/sdk';
import { authClient } from '@/lib/auth-client';

function getPostLoginRoute(): string {
  const claims = authClient.getTokenClaims();
  if (!claims) return '/u/login';
  const platformSlug = process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG ?? 'sentry';
  const isPlatformTenant = claims.tenantSlug === platformSlug;
  const isInternal =
    Array.isArray(claims.groups) &&
    (claims.groups as string[]).includes(`${platformSlug}-internal`);
  if (isPlatformTenant && isInternal) return `/t/${platformSlug}/dashboard`;
  const slug = (claims.tenantSlug as string) ?? '';
  return slug ? `/t/${slug}/dashboard` : '/u/login';
}

interface LoginFormProps {
  tenantSlug?: string;
  tenantLogo?: string | null;
  primaryColor?: string | null;
}

export function LoginForm({ tenantSlug: _tenantSlug, tenantLogo, primaryColor }: LoginFormProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      if (!user.emailVerified) {
        router.replace('/u/verify-email');
      } else {
        router.replace(getPostLoginRoute());
      }
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <AuthLayout logoUrl={tenantLogo} primaryColor={primaryColor}>
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

  if (user) return null;

  return (
    <AuthLayout logoUrl={tenantLogo} primaryColor={primaryColor}>
      <SentryAuthFlow onSuccess={() => router.replace(getPostLoginRoute())} />
      <p
        style={{
          marginTop: '20px',
          textAlign: 'center',
          fontSize: '13px',
          fontFamily: 'DM Sans, sans-serif',
          color: '#605E5A',
        }}
      >
        New here?{' '}
        <a
          href="/onboarding"
          style={{ color: '#2ABF6C', textDecoration: 'none', fontWeight: 500 }}
        >
          Create a workspace →
        </a>
      </p>
    </AuthLayout>
  );
}
