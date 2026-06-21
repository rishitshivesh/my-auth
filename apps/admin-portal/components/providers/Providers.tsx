'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SentryProvider } from '@scrolloop/sdk';
import { AdminProvider } from '@scrolloop/admin-client';
import { ThemeProvider } from '@repo/ui';
import { authClient } from '@/lib/auth-client';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
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
