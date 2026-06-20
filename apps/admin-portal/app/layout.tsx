// @ts-ignore
import "@repo/ui/globals.css";
import { ThemeProvider } from "@repo/ui";
import { SentryProvider, SentryClient } from "@scrolloop/sdk";
import { AdminProvider } from "@scrolloop/admin-client";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";

// SentryClient initialized once — config from env vars only, never hardcoded
export const authClient = new SentryClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || "http://localhost:4000",
  tenant: process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG || "sentry",
  debug: process.env.NODE_ENV === "development",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans">
        <ReactQueryProvider>
          <SentryProvider client={authClient}>
            <AdminProvider
              tenantSlug={process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG}
              baseUrl={process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}
            >
              <ThemeProvider>{children}</ThemeProvider>
            </AdminProvider>
          </SentryProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
