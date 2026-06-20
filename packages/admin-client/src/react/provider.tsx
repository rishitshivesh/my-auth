'use client';
import { createContext, useContext, useMemo } from 'react';
import type React from 'react';
import { SentryAdminClient } from '../client.js';
import { SentryAxiosTransport } from '@scrolloop/sentry-config/transport';
import { resolveSentryConfig } from '@scrolloop/sentry-config';

const AdminCtx = createContext<SentryAdminClient | null>(null);

export function AdminProvider({
  children,
  tenantSlug,
  baseUrl,
}: {
  children: React.ReactNode;
  tenantSlug?: string;
  baseUrl?: string;
}) {
  const client = useMemo(() => {
    const config = resolveSentryConfig({ tenantSlug, baseURL: baseUrl });
    const transport = new SentryAxiosTransport(config);
    return new SentryAdminClient(transport);
  }, [tenantSlug, baseUrl]);

  return <AdminCtx.Provider value={client}>{children}</AdminCtx.Provider>;
}

export function useAdminClient(): SentryAdminClient {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error('useAdminClient must be inside <AdminProvider>');
  return ctx;
}
