// @ts-ignore

"use client";
import "@repo/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { ThemeProvider } from "@repo/ui";


// import { defaultAuthClient } from "@repo/web-sdk";
import { SentryProvider } from "@scrolloop/sdk";

import { createWebClient } from "@scrolloop/sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const authClient = createWebClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || "http://localhost:4000",
  tenant:
    process.env.NEXT_PUBLIC_SENTRY_TENANT_ID ||
    process.env.SENTRY_TENANT_ID ||
    "",
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
      <head>
        <Script
          async={true}
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8195619606985915"
          crossOrigin="anonymous"
        ></Script>
        <meta name="google-adsense-account" content="ca-pub-8195619606985915" />
      </head>

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

