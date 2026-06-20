"use client";
// @ts-ignore
import "@repo/ui/globals.css";

import { ThemeProvider } from "@repo/ui";

import { SentryProvider } from "@scrolloop/sdk";

import { SentryClient } from "@scrolloop/sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const customTransport = async (request: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  credentials?: "include" | "omit" | "same-origin";
}) => {
  const isFormData = request.body instanceof FormData;
  const headers = { ...request.headers };

  if (isFormData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  const response = await fetch(request.url, {
    method: request.method,
    headers,
    body: isFormData ? (request.body as FormData) : (request.body ? JSON.stringify(request.body) : undefined),
    credentials: request.credentials || "include",
  });

  let data: unknown;
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    data,
  };
};

export const authClient = new SentryClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || "http://localhost:4000",
  tenant: "55180ffa-a05e-4ad5-ba05-a16bf834d3f3",
  debug: process.env.NODE_ENV === "development",
  transport: customTransport,
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

