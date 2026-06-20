import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | Scrolloop Sentry Docs',
    default: 'Scrolloop Sentry Docs',
  },
  description: 'Enterprise authentication platform documentation — multi-tenant auth, RBAC, MFA, and more.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
