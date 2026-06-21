'use client';

import * as React from 'react';
import { Copy, Check, Download, AlertTriangle } from 'lucide-react';
import { SentryButton } from '@repo/ui';
import { cn } from '@repo/ui/lib/utils';

interface StepSaveBackupProps {
  backupCodes: string[];
  onDone: () => void;
}

export function StepSaveBackup({ backupCodes, onDone }: StepSaveBackupProps) {
  const [copied, setCopied] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  const handleCopyAll = async () => {
    const text = backupCodes.join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = [
      'Scrolloop Sentry — Backup Codes',
      '================================',
      'Each code can only be used once.',
      'Store these in a safe place.',
      '',
      ...backupCodes,
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sentry-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-display font-light text-foreground">
          Save your backup codes
        </h2>
        <p className="text-sm font-body text-muted-foreground leading-relaxed">
          Use these codes to access your account if you lose your authenticator
          device. Keep them somewhere safe — each code can only be used once.
        </p>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
        <p className="text-xs font-body text-muted-foreground leading-relaxed">
          <span className="font-display font-semibold text-foreground">Important:</span>{' '}
          Each backup code works only once. After use, it is permanently invalidated.
          If you run out of codes, you can generate new ones from your security settings.
        </p>
      </div>

      {/* Codes grid */}
      <div className="rounded-sm border border-border bg-black/5 p-4">
        <div className="grid grid-cols-2 gap-2">
          {backupCodes.map((code, i) => (
            <div
              key={i}
              className="flex items-center justify-center rounded-[2px] border border-border bg-background px-3 py-2"
            >
              <code className="font-mono text-sm text-foreground tracking-widest">
                {code}
              </code>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopyAll}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-sm border px-4 py-2.5 text-xs font-display font-semibold transition-all',
            copied
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-black/5 text-muted-foreground hover:border-accent/40 hover:text-foreground'
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? 'Copied!' : 'Copy all'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-border bg-black/5 px-4 py-2.5 text-xs font-display font-semibold text-muted-foreground transition-all hover:border-accent/40 hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          Download .txt
        </button>
      </div>

      {/* Mandatory checkbox */}
      <label className="flex cursor-pointer items-start gap-3">
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="sr-only peer"
          />
          <div
            className={cn(
              'h-4 w-4 rounded-[2px] border transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-accent/20',
              confirmed
                ? 'border-accent bg-accent'
                : 'border-border bg-black/5'
            )}
          >
            {confirmed && (
              <Check className="h-3 w-3 text-accent-foreground m-auto mt-0.5" />
            )}
          </div>
        </div>
        <span className="text-xs font-body text-muted-foreground leading-relaxed">
          I&apos;ve saved these codes in a safe place and understand that each code
          can only be used once.
        </span>
      </label>

      <SentryButton
        type="button"
        variant="primary"
        className="w-full"
        disabled={!confirmed}
        onClick={onDone}
      >
        I&apos;ve saved my codes — finish setup
      </SentryButton>
    </div>
  );
}
