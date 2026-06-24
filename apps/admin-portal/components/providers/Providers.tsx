'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SentryProvider } from '@scrolloop/sdk';
import { AdminProvider } from '@scrolloop/admin-client';
import { ThemeProvider } from '@repo/ui';
import { authClient } from '@/lib/auth-client';
import { SentryAPIError } from '@scrolloop/sentry-config';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Never retry 401/403 — these are auth failures, not transient errors.
              // Retrying would trigger multiple refresh attempts and could
              // revoke the token family via reuse detection.
              if (
                error instanceof SentryAPIError &&
                (error.isUnauthorized || error.isForbidden)
              ) {
                return false;
              }
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SentryProvider client={authClient}>
        <AdminProvider
          tenantSlug={process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG ?? "sentry"}
          baseUrl={process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </AdminProvider>
      </SentryProvider>
    </QueryClientProvider>
  );
}
