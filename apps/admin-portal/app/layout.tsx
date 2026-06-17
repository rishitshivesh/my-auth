"use client";
// @ts-ignore
import "@repo/ui/globals.css";

import { ThemeProvider } from "@repo/ui";

import { SentryProvider } from "@scrolloop/sdk";

import { createWebClient } from "@scrolloop/sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const authClient = createWebClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || "http://localhost:4000",
  tenant:
    process.env.NEXT_PUBLIC_SENTRY_TENANT_ID ||
    process.env.SENTRY_TENANT_ID ||
    "220bea14-69ca-420f-a8a2-d017e600ea4b",
  debug: process.env.NODE_ENV === "development",
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans">
        <QueryClientProvider client={queryClient}>
          <SentryProvider client={authClient}>
            <ThemeProvider>{children}</ThemeProvider>
          </SentryProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}

