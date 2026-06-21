'use client';

import * as React from 'react';
import { Copy, Check, QrCode, Key } from 'lucide-react';
import { SentryButton } from '@repo/ui';
import { cn } from '@repo/ui/lib/utils';

interface StepScanQrProps {
  qrCodeUrl: string;
  secret: string;
  email: string;
  onNext: () => void;
}

export function StepScanQr({ qrCodeUrl, secret, email, onNext }: StepScanQrProps) {
  const [view, setView] = React.useState<'qr' | 'manual'>('qr');
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-display font-light text-foreground">
          Scan the QR code
        </h2>
        <p className="text-sm font-body text-muted-foreground leading-relaxed">
          Open your authenticator app and scan the QR code below. If you
          can&apos;t scan it, you can enter the setup key manually.
        </p>
      </div>

      {/* Toggle */}
      <div className="flex gap-1 rounded-sm border border-border bg-black/5 p-1">
        <button
          type="button"
          onClick={() => setView('qr')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-[2px] px-4 py-2 text-xs font-display font-semibold transition-all',
            view === 'qr'
              ? 'bg-background border border-border text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <QrCode className="h-3.5 w-3.5" />
          Scan QR Code
        </button>
        <button
          type="button"
          onClick={() => setView('manual')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-[2px] px-4 py-2 text-xs font-display font-semibold transition-all',
            view === 'manual'
              ? 'bg-background border border-border text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Key className="h-3.5 w-3.5" />
          Enter key manually
        </button>
      </div>

      {view === 'qr' ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-sm border border-border bg-white p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCodeUrl}
              alt="MFA QR Code"
              className="h-48 w-48 object-contain"
            />
            <p className="text-[11px] font-body text-muted-foreground">
              Account:{' '}
              <span className="font-display font-semibold text-foreground">
                {email}
              </span>
            </p>
          </div>
          <p className="text-xs font-body text-muted-foreground leading-relaxed text-center">
            Point your authenticator app&apos;s camera at the code above.
            It will be added automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
              Setup key
            </p>
            <div className="flex items-center gap-2 rounded-sm border border-border bg-black/5 px-4 py-3">
              <code className="flex-1 font-mono text-sm text-foreground tracking-widest break-all">
                {secret}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm border transition-all',
                  copied
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground'
                )}
                aria-label="Copy secret key"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
          <div className="rounded-sm border border-border bg-black/5 px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
              How to enter manually
            </p>
            <ol className="space-y-1 text-xs font-body text-muted-foreground list-decimal list-inside leading-relaxed">
              <li>Open your authenticator app and choose &ldquo;Add account&rdquo;</li>
              <li>Select &ldquo;Enter a setup key&rdquo; or &ldquo;Manual entry&rdquo;</li>
              <li>Enter your email address as the account name</li>
              <li>Paste or type the setup key above</li>
            </ol>
          </div>
        </div>
      )}

      <SentryButton
        type="button"
        variant="primary"
        className="w-full"
        onClick={onNext}
      >
        I&apos;ve scanned the code — continue
      </SentryButton>
    </div>
  );
}
