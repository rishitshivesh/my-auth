'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SentryProvider } from '@scrolloop/sdk';
import { AdminProvider } from '@scrolloop/admin-client';
import { ThemeProvider } from '@repo/ui';
import { authClient } from '@/lib/auth-client';
import { currentPageTenant } from '@/lib/tenant-client';
import { useDocumentTitleFromHeading } from '@/hooks/use-document-title';

/** Marks the document once React has attached handlers, so browser tests never act on inert markup. */
function useHydrationMarker(): void {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Re-read on every navigation: moving between workspaces (/t/a -> /t/b) must rebuild the session state.
  usePathname();
  const tenant = currentPageTenant();
  useHydrationMarker();
  useDocumentTitleFromHeading();
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
      <SentryProvider key={tenant} client={authClient}>
        <AdminProvider
          tenantSlug={tenant}
          baseUrl={process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </AdminProvider>
      </SentryProvider>
    </QueryClientProvider>
  );
}
