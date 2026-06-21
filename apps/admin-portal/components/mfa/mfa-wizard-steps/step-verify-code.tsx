'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { SentryButton } from '@repo/ui';
import { cn } from '@repo/ui/lib/utils';

interface StepVerifyCodeProps {
  onVerify: (code: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function StepVerifyCode({ onVerify, isLoading, error }: StepVerifyCodeProps) {
  const [digits, setDigits] = React.useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join('');

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, '').slice(0, 6);
      const next = [...digits];
      for (let i = 0; i < 6; i++) next[i] = cleaned[i] ?? '';
      setDigits(next);
      inputRefs.current[Math.min(cleaned.length, 5)]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = React.useCallback(async () => {
    if (code.length !== 6 || isLoading) return;
    await onVerify(code);
  }, [code, isLoading, onVerify]);

  // Auto-submit when all 6 digits entered
  React.useEffect(() => {
    if (code.length === 6) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Reset digits on error so user can retry
  React.useEffect(() => {
    if (error) {
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  }, [error]);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-display font-light text-foreground">
          Verify it&apos;s working
        </h2>
        <p className="text-sm font-body text-muted-foreground leading-relaxed">
          Enter the 6-digit code from your authenticator app to confirm everything
          is set up correctly.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2 justify-between">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              disabled={isLoading}
              aria-label={`Digit ${i + 1}`}
              className={cn(
                'h-14 w-full rounded-sm border text-center text-xl font-display font-medium',
                'bg-black/5 transition-all outline-none',
                digit ? 'border-accent ring-2 ring-accent/10' : 'border-border',
                isLoading && 'opacity-50 grayscale'
              )}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] font-body text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          Codes refresh every 30 seconds
        </div>
      </div>

      <SentryButton
        type="button"
        variant="primary"
        className="w-full"
        disabled={code.length !== 6}
        isLoading={isLoading}
        onClick={handleSubmit}
      >
        Verify code
      </SentryButton>
    </div>
  );
}
