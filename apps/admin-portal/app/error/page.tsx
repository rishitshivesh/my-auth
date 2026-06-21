'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

const REASONS: Record<string, { title: string; body: string }> = {
  api_unavailable: {
    title: 'Auth service unreachable',
    body: 'The authentication service could not be reached. Check that it is running and try again.',
  },
  session_expired: {
    title: 'Session expired',
    body: 'Your session has expired. Please sign in again to continue.',
  },
  forbidden: {
    title: 'Access denied',
    body: "You don't have permission to view this page.",
  },
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get('reason') ?? 'unknown';
  const info = REASONS[reason] ?? {
    title: 'Something went wrong',
    body: 'An unexpected error occurred. Please try again or contact support.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)] p-6">
      <div
        className="w-full max-w-md rounded-3xl border border-black/[0.06] p-10 text-center"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.06)',
        }}
      >
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-danger)]/10">
          <AlertTriangle className="h-7 w-7 text-[var(--color-danger)]" />
        </div>

        <h1
          className="mb-2 text-xl font-semibold tracking-tight text-[var(--color-text-primary)]"
          style={{ fontFamily: 'Montserrat, sans-serif' }}
        >
          {info.title}
        </h1>

        <p
          className="mb-8 text-sm leading-relaxed text-[var(--color-text-secondary)]"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          {info.body}
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>

          {reason !== 'api_unavailable' && (
            <button
              onClick={() => router.push('/u/login')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-black/[0.03]"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </button>
          )}
        </div>

        <p
          className="mt-8 text-[11px] text-[var(--color-text-tertiary)]"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          reason: {reason}
        </p>
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
