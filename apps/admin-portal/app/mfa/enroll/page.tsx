'use client';

import * as React from 'react';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { GlassCard, SentryButton, SentryInput } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";
import { useSetupTotp, useVerifyTotp } from '@/lib/queries';
import {
  ShieldCheck,
  Smartphone,
  Fingerprint,
  Mail,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@scrolloop/sdk';

type WizardStep = 'method' | 'setup-totp' | 'setup-passkey' | 'backup' | 'success';
type FactorType = 'totp' | 'passkey' | null;

export default function MfaEnrollPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { client } = useAuth();

  const [step, setStep] = React.useState<WizardStep>('method');
  const [selectedFactor, setSelectedFactor] = React.useState<FactorType>(null);
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [savedConfirmed, setSavedConfirmed] = React.useState(false);
  const [passkeyError, setPasskeyError] = React.useState<string | null>(null);
  const [passkeyLoading, setPasskeyLoading] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);
  const [showManualKey, setShowManualKey] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // 6-box TOTP code state
  const [digits, setDigits] = React.useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const totpCode = digits.join('');

  const { mutate: setupTotp, data: totpData, isPending: isSettingUp } = useSetupTotp();
  const { mutate: verifyTotp, isPending: isVerifying } = useVerifyTotp();

  const handleContinueToTotp = () => {
    setSelectedFactor('totp');
    setupTotp(undefined, {
      onSuccess: () => {
        setDigits(['', '', '', '', '', '']);
        setVerifyError(null);
        setStep('setup-totp');
      },
    });
  };

  const handleContinueToPasskey = () => {
    setSelectedFactor('passkey');
    setStep('setup-passkey');
  };

  const handleDigitChange = (idx: number, val: string) => {
    if (val.length > 1) {
      // Paste handling
      const cleaned = val.replace(/\D/g, '').slice(0, 6);
      const next = Array.from({ length: 6 }, (_, i) => cleaned[i] ?? '');
      setDigits(next);
      const focusIdx = Math.min(cleaned.length, 5);
      inputRefs.current[focusIdx]?.focus();
      return;
    }
    const cleaned = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = cleaned;
    setDigits(next);
    if (cleaned && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerifyTotp = () => {
    if (totpCode.length !== 6) return;
    setVerifyError(null);
    verifyTotp(totpCode, {
      onSuccess: (data) => {
        setBackupCodes(data.backupCodes ?? []);
        setStep('backup');
      },
      onError: (err) => {
        setVerifyError(err.message ?? 'Invalid code. Please try again.');
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      },
    });
  };

  const handlePasskeyEnroll = async () => {
    if (!window.PublicKeyCredential) {
      setPasskeyError('Passkeys are not supported on this device or browser.');
      return;
    }
    setPasskeyLoading(true);
    setPasskeyError(null);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const serverData = await client.startPasskeyRegistration();
      const { sessionNonce, ...optionsJSON } = serverData as { sessionNonce: string; [key: string]: unknown };
      const assertion = await startRegistration({ optionsJSON: optionsJSON as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'] });
      await client.finishPasskeyRegistration(assertion, sessionNonce);
      // Passkeys skip backup codes — go directly to success
      setStep('success');
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'NotAllowedError') {
        setPasskeyLoading(false);
        return;
      }
      setPasskeyError(e?.message ?? 'Passkey registration failed. Please try again.');
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDownloadCodes = () => {
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sentry-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGoToDashboard = () => {
    const tokenFromParam = searchParams.get('token');
    if (tokenFromParam) {
      // Came from enrollment-required redirect — read tenant from query param or token
    }
    const slug = client.getUserTenantSlug();
    router.push(slug ? `/t/${slug}/dashboard` : '/u/login');
  };

  const steps: WizardStep[] = selectedFactor === 'passkey'
    ? ['method', 'setup-passkey', 'success']
    : ['method', 'setup-totp', 'backup', 'success'];
  const currentStepIndex = steps.indexOf(step);

  return (
    <AuthLayout>
      <div className="space-y-8 animate-fade-up">
        {/* Step indicator */}
        <div className="flex justify-center gap-2">
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                i === currentStepIndex ? 'w-8 bg-[var(--color-accent)]' : 'w-4 bg-black/5'
              )}
            />
          ))}
        </div>

        {/* ─── Step 1: Method selection ─────────────────────────── */}
        {step === 'method' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold text-[var(--color-text-primary)]">
                Secure your account
              </h2>
              <p className="text-sm font-body text-[var(--color-text-secondary)]">
                Choose a multi-factor authentication method.
              </p>
            </div>

            <div className="space-y-3">
              {/* Authenticator App (TOTP) */}
              <button
                onClick={handleContinueToTotp}
                disabled={isSettingUp}
                className="w-full text-left group focus:outline-none disabled:opacity-60"
              >
                <GlassCard tier={1} className="p-4 flex items-center gap-4 group-hover:border-[var(--color-accent)]/30 transition-all">
                  <div className="p-2.5 rounded-sm bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-display font-semibold">Authenticator App</p>
                    <p className="text-xs font-body text-[var(--color-text-tertiary)]">
                      Use Google Authenticator, Authy, or 1Password
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]/30 group-hover:text-[var(--color-accent)] transition-colors" />
                </GlassCard>
              </button>

              {/* Passkey */}
              <button
                onClick={handleContinueToPasskey}
                className="w-full text-left group focus:outline-none"
              >
                <GlassCard tier={1} className="p-4 flex items-center gap-4 group-hover:border-[var(--color-accent)]/30 transition-all">
                  <div className="p-2.5 rounded-sm bg-black/5 text-[var(--color-text-secondary)]">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-display font-semibold">Passkey</p>
                    <p className="text-xs font-body text-[var(--color-text-tertiary)]">
                      Touch ID, Face ID, or hardware key
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]/30 group-hover:text-[var(--color-accent)] transition-colors" />
                </GlassCard>
              </button>

              {/* Email OTP — coming soon */}
              <div className="opacity-40 cursor-not-allowed">
                <GlassCard tier={1} className="p-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-sm bg-black/5 text-[var(--color-text-tertiary)]">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-display font-semibold">Email Code</p>
                    <p className="text-xs font-body text-[var(--color-text-tertiary)]">
                      One-time code via email — coming soon
                    </p>
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 2a: TOTP setup ──────────────────────────────── */}
        {step === 'setup-totp' && totpData && (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-display font-semibold text-[var(--color-text-primary)]">
                Set up authenticator
              </h2>
              <p className="text-sm font-body text-[var(--color-text-secondary)]">
                Scan the QR code with your authenticator app, then enter the 6-digit code.
              </p>
            </div>

            {/* QR code */}
            <div className="flex justify-center p-4 bg-white rounded-sm border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpData.qrCode} alt="TOTP QR code" className="w-48 h-48" />
            </div>

            {/* Manual entry toggle */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowManualKey((v) => !v)}
                className="text-xs font-body text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors underline underline-offset-4"
              >
                {showManualKey ? 'Hide manual entry key' : "Can't scan? Enter key manually"}
              </button>
              {showManualKey && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <code className="text-xs font-mono font-bold bg-black/5 px-3 py-2 rounded-sm tracking-widest select-all">
                    {totpData.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(totpData.secret)}
                    className="p-1.5 rounded-sm bg-black/5 hover:bg-black/10 transition-colors text-[var(--color-text-tertiary)]"
                    aria-label="Copy key"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* 6-box digit input */}
            <div className="space-y-3">
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-[var(--color-text-tertiary)] text-center">
                Enter verification code
              </p>
              <div className="flex gap-2 justify-between" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    disabled={isVerifying}
                    className={cn(
                      'h-14 w-12 rounded-sm border text-center text-xl font-display font-medium',
                      'bg-black/5 transition-all outline-none',
                      digit ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/10' : 'border-border',
                      isVerifying && 'opacity-50 grayscale'
                    )}
                  />
                ))}
              </div>

              {verifyError && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-danger)]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {verifyError}
                </div>
              )}

              <SentryButton
                variant="accent"
                className="w-full"
                onClick={handleVerifyTotp}
                isLoading={isVerifying}
                disabled={totpCode.length !== 6}
              >
                Verify &amp; Continue
              </SentryButton>
            </div>
          </div>
        )}

        {/* ─── Step 2b: Passkey setup ───────────────────────────── */}
        {step === 'setup-passkey' && (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-display font-semibold text-[var(--color-text-primary)]">
                Register a passkey
              </h2>
              <p className="text-sm font-body text-[var(--color-text-secondary)]">
                Your device will prompt you for biometrics or a PIN to complete registration.
              </p>
            </div>

            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center text-[var(--color-accent)]">
                <Fingerprint className="w-10 h-10" strokeWidth={1.25} />
              </div>
            </div>

            {passkeyError && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-danger)]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {passkeyError}
              </div>
            )}

            <SentryButton
              variant="accent"
              className="w-full"
              isLoading={passkeyLoading}
              onClick={handlePasskeyEnroll}
            >
              {passkeyLoading ? 'Waiting for passkey…' : 'Register Passkey'}
            </SentryButton>

            <button
              type="button"
              onClick={() => setStep('method')}
              className="w-full text-center text-xs font-body text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              &larr; Choose a different method
            </button>
          </div>
        )}

        {/* ─── Step 3: Backup codes ─────────────────────────────── */}
        {step === 'backup' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold text-[var(--color-text-primary)]">
                Save your backup codes
              </h2>
              <p className="text-sm font-body text-[var(--color-text-secondary)]">
                Use these if you ever lose access to your authenticator app.
              </p>
            </div>

            {/* Warning banner */}
            <div className="flex items-start gap-3 p-3 rounded-sm border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5">
              <AlertTriangle className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
              <p className="text-xs font-body text-[var(--color-text-secondary)]">
                These codes cannot be shown again. Save them somewhere safe before continuing.
              </p>
            </div>

            {/* Codes grid */}
            <div className="grid grid-cols-2 gap-2 bg-black/5 p-4 rounded-sm border border-border">
              {backupCodes.map((code) => (
                <code
                  key={code}
                  className="text-xs font-mono text-[var(--color-text-secondary)] tracking-wide"
                >
                  {code}
                </code>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <SentryButton
                variant="ghost"
                size="sm"
                className="flex-1 gap-2"
                onClick={handleDownloadCodes}
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </SentryButton>
              <SentryButton
                variant="ghost"
                size="sm"
                className="flex-1 gap-2"
                onClick={handleCopyAll}
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Copied!' : 'Copy all'}
              </SentryButton>
            </div>

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-[var(--color-accent)] cursor-pointer"
              />
              <span className="text-xs font-body text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">
                I have saved my backup codes in a safe place
              </span>
            </label>

            <SentryButton
              variant="primary"
              className="w-full"
              disabled={!savedConfirmed}
              onClick={() => setStep('success')}
            >
              Continue
            </SentryButton>
          </div>
        )}

        {/* ─── Step 4: Success ──────────────────────────────────── */}
        {step === 'success' && (
          <div className="space-y-8 py-4 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center text-[var(--color-accent)]">
                <CheckCircle2 className="w-10 h-10" strokeWidth={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold text-[var(--color-text-primary)]">
                MFA is now active
              </h2>
              <p className="text-sm font-body text-[var(--color-text-secondary)]">
                {selectedFactor === 'passkey'
                  ? 'Your account is now secured with a passkey.'
                  : 'Your account is now secured with an authenticator app.'}
              </p>
            </div>
            <SentryButton
              variant="accent"
              className="w-full h-10"
              onClick={handleGoToDashboard}
            >
              Go to Dashboard
            </SentryButton>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
