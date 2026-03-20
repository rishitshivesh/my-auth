// @ts-ignore

"use client";
import "@repo/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
// import { defaultAuthClient } from "@repo/web-sdk";
import { FortKnoxProvider } from "@fortknox/sdk";

import { createWebClient } from "@fortknox/sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const authClient = createWebClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || "http://localhost:4000",
  tenant: process.env.NEXT_PUBLIC_FORTKNOX_TENANT_ID || "",
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

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          async={true}
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8195619606985915"
          crossOrigin="anonymous"
        ></Script>
        <meta name="google-adsense-account" content="ca-pub-8195619606985915" />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* <AuthProvider authClient={defaultAuthClient}> */}
        <QueryClientProvider client={queryClient}>
          <FortKnoxProvider client={authClient}>
            <ThemeProvider>{children}</ThemeProvider>
          </FortKnoxProvider>
        </QueryClientProvider>
        {/* </AuthProvider> */}
      </body>
    </html>
  );
}
