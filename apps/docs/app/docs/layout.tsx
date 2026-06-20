import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <span style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>
            Sentry <span style={{ color: '#2ABF6C' }}>Docs</span>
          </span>
        ),
      }}
      links={[
        {
          text: 'Admin Portal',
          url: 'http://localhost:3000',
          external: true,
        },
        {
          text: 'API Reference',
          url: '/docs/api',
        },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
