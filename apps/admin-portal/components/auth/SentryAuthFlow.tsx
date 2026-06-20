'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useEmailAuthFlow } from '@/hooks/use-email-auth-flow';
import { useProviders } from '@/hooks/use-providers';
import { useAuth } from '@scrolloop/sdk';
import { SentryButton, SentryInput } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";
import { AlertCircle, Github, Lock, Mail, Fingerprint, Chrome, CheckCircle, Key, Loader2 } from 'lucide-react';

function SocialIcon({ provider }: { provider: string }) {
  if (provider === 'google') {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.18 1-.78 1.85-1.63 2.42v2.01h2.64c1.55-1.42 2.44-3.51 2.44-5.94z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-2.64-2.01c-.73.49-1.66.78-2.64.78-2.83 0-5.23-1.92-6.08-4.5H2.18v2.08C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.92 14.61c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V8.31H2.18C1.41 9.87 1 11.61 1 13.25c0 1.64.41 3.38 1.18 4.94l3.74-3.58z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.74 3.58c.85-2.58 3.25-4.5 6.08-4.5z" fill="#EA4335" />
      </svg>
    )
  }
  if (provider === 'github') {
    return <Github className="h-4 w-4" />
  }
  if (provider === 'microsoft') {
    return (
      <svg className="h-4 w-4" viewBox="0 0 23 23" aria-hidden="true">
        <path fill="var(--color-text-tertiary)" d="M1 1h10v10H1z" />
        <path fill="var(--color-text-tertiary)" d="M12 1h10v10H12z" />
        <path fill="var(--color-text-tertiary)" d="M1 12h10v10H1z" />
        <path fill="var(--color-text-tertiary)" d="M12 12h10v10H12z" />
      </svg>
    )
  }
  return null
}

function MagicLinkSection({ email }: { email: string }) {
  const { sendMagicLink } = useAuth();
  const [stage, setStage] = React.useState<'request' | 'sent' | 'error'>('request');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    try {
      await sendMagicLink(email);
      setStage('sent');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send magic link');
      setStage('error');
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'sent') {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 border border-accent/25">
            <CheckCircle className="h-6 w-6 text-accent" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-display font-semibold text-foreground">Check your email</h3>
          <p className="text-xs font-body text-muted-foreground leading-relaxed">
            We've sent a magic link to <strong className="text-foreground">{email}</strong>. Click the link in your inbox to sign in.
          </p>
        </div>
        <div className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60 py-2 border-t border-b border-border/40">
          Link expires in 15 minutes
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="text-xs font-display font-bold uppercase tracking-[0.1em] text-accent hover:text-accent/80 transition-colors"
        >
          {loading ? 'Sending...' : 'Resend link'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs font-body text-muted-foreground leading-relaxed">
        We will send you a secure, passwordless magic link to <strong className="text-foreground">{email}</strong>. Clicking the link will authenticate you instantly.
      </p>
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
      <SentryButton
        type="button"
        onClick={handleSend}
        className="w-full"
        variant="primary"
        isLoading={loading}
      >
        Send Magic Link
      </SentryButton>
    </div>
  );
}

function PasskeySection({ email, onSuccess }: { email: string; onSuccess?: () => void }) {
  const { startPasskeyLogin, finishPasskeyLogin } = useAuth();
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const handlePasskeyLogin = async () => {
    if (!window.PublicKeyCredential) {
      setStatus('error');
      setError('Passkeys are not supported on this device/browser');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const serverData = await startPasskeyLogin(email);
      const { sessionNonce, ...optionsJSON } = serverData;
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const assertion = await startAuthentication({ optionsJSON });
      await finishPasskeyLogin(email, assertion, sessionNonce);
      setStatus('success');
      onSuccess?.();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setStatus('idle');
        return;
      }
      setStatus('error');
      setError(err?.message ?? 'Failed to authenticate with passkey');
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-xs font-body text-muted-foreground leading-relaxed">
        Use your registered passkey (fingerprint, face recognition, or device PIN) to sign in securely.
      </p>
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
      <SentryButton
        type="button"
        onClick={handlePasskeyLogin}
        className="w-full"
        variant="accent"
        isLoading={status === 'loading'}
      >
        {status === 'loading' ? 'Waiting for passkey...' : 'Sign in with Passkey'}
      </SentryButton>
    </div>
  );
}

interface SentryAuthFlowProps {
  onSuccess?: () => void
}

export function SentryAuthFlow({ onSuccess }: SentryAuthFlowProps) {
  const router = useRouter();
  const flow = useEmailAuthFlow();
  const { client, verifyMfaLogin, initiateSocialLogin } = useAuth();
  const { data: providers } = useProviders();

  // MFA inline state
  const [mfaTempToken, setMfaTempToken] = React.useState<string | null>(null);
  const [mfaScreen, setMfaScreen] = React.useState<'totp' | 'sms' | null>(null);
  const [mfaDigits, setMfaDigits] = React.useState<string[]>(['', '', '', '', '', '']);
  const [mfaLoading, setMfaLoading] = React.useState(false);
  const [mfaError, setMfaError] = React.useState<string | null>(null);
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const mfaCode = mfaDigits.join('');

  const enabledSocial = (providers?.social ?? []).filter(p => p.enabled);

  const handleSocialLogin = (provider: string) => {
    initiateSocialLogin(provider);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const email = formData.get('email') as string;
    try {
      await flow.submitEmail(email);
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const password = formData.get('password') as string;
    try {
      const result = await client.login({ email: flow.email, password });

      if (result.mfaRequired && result.mfaChallenge) {
        setMfaTempToken(result.mfaChallenge.tempToken);
        setMfaScreen(result.mfaChallenge.methods.includes('totp') ? 'totp' : 'sms');
        setMfaDigits(['', '', '', '', '', '']);
        setMfaError(null);
        return;
      }

      onSuccess?.();
    } catch {
      // Error handled by hook/logic
    }
  };

  const handleMfaChange = (index: number, value: string) => {
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, '').slice(0, 6);
      const next = [...mfaDigits];
      for (let i = 0; i < 6; i++) next[i] = cleaned[i] ?? '';
      setMfaDigits(next);
      inputRefs.current[Math.min(cleaned.length, 5)]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...mfaDigits];
    next[index] = digit;
    setMfaDigits(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleMfaKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !mfaDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleMfaSubmit = React.useCallback(async () => {
    if (mfaCode.length !== 6 || mfaLoading || !mfaTempToken) return;
    setMfaLoading(true);
    setMfaError(null);
    try {
      await verifyMfaLogin(mfaTempToken, mfaCode);
      onSuccess?.();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setMfaDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setMfaLoading(false);
    }
  }, [mfaCode, mfaLoading, mfaTempToken, verifyMfaLogin, onSuccess]);

  React.useEffect(() => {
    if (mfaCode.length === 6 && mfaScreen) handleMfaSubmit();
  }, [mfaCode, mfaScreen, handleMfaSubmit]);

  return (
    <AnimatePresence mode="wait">
      {/* MFA SCREEN */}
      {mfaScreen && (
        <motion.div
          key="mfa"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-8"
        >
          <div className="space-y-2">
            <h2 className="text-xl font-display font-light text-foreground">
              Verify identity
            </h2>
            <p className="text-sm font-body text-muted-foreground">
              {mfaScreen === 'totp'
                ? 'Enter the 6-digit code from your authenticator app'
                : 'Enter the 6-digit code sent to your phone'}
            </p>
          </div>

          <div className="flex gap-2 justify-between">
            {mfaDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleMfaChange(i, e.target.value)}
                onKeyDown={(e) => handleMfaKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                disabled={mfaLoading}
                className={cn(
                  'h-14 w-12 rounded-sm border text-center text-xl font-display font-medium',
                  'bg-black/5 transition-all outline-none',
                  digit ? 'border-accent ring-2 ring-accent/10' : 'border-border',
                  mfaLoading && 'opacity-50 grayscale'
                )}
              />
            ))}
          </div>

          {mfaError && (
            <div className="flex items-center gap-2 text-xs text-destructive animate-fade-in">
              <AlertCircle className="h-3.5 w-3.5" />
              {mfaError}
            </div>
          )}

          <div className="space-y-4 pt-2">
            <SentryButton
              className="w-full"
              variant="accent"
              isLoading={mfaLoading}
              onClick={handleMfaSubmit}
              disabled={mfaCode.length !== 6}
            >
              Verify
            </SentryButton>
            
            <button
              type="button"
              className="w-full text-center text-xs font-body text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
              onClick={() => {
                setMfaScreen(null);
                setMfaTempToken(null);
                setMfaDigits(['', '', '', '', '', '']);
                setMfaError(null);
              }}
            >
              Use another method
            </button>
          </div>
        </motion.div>
      )}

      {/* EMAIL STEP */}
      {!mfaScreen && flow.step === 'email' && (
        <motion.div
          key="email"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-8"
        >
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-display font-light text-foreground">
              Welcome back
            </h2>
            <p className="text-sm font-body text-muted-foreground">
              Sign in to your secure workspace
            </p>
          </div>

          {enabledSocial.length > 0 && (
            <>
              <div
                className={cn(
                  'grid gap-3',
                  enabledSocial.length === 1 && 'grid-cols-1',
                  enabledSocial.length === 2 && 'grid-cols-2',
                  enabledSocial.length >= 3 && 'grid-cols-3',
                )}
              >
                {enabledSocial.map(p => (
                  <SentryButton
                    key={p.provider}
                    variant="ghost"
                    size="sm"
                    className="h-10"
                    aria-label={`Sign in with ${p.displayName ?? p.provider}`}
                    onClick={() => handleSocialLogin(p.provider)}
                  >
                    <SocialIcon provider={p.provider} />
                    {enabledSocial.length <= 2 && (
                      <span className="ml-2 text-xs font-body capitalize">
                        {p.displayName ?? p.provider}
                      </span>
                    )}
                  </SentryButton>
                ))}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] font-display font-bold uppercase tracking-[0.1em]">
                  <span className="bg-card px-3 text-muted-foreground/50">Or continue with email</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <SentryInput
              label="Work Email"
              name="email"
              type="email"
              placeholder="name@company.com"
              required
              error={flow.error || undefined}
              disabled={flow.loading}
              autoFocus
            />

            <SentryButton
              type="submit"
              className="w-full"
              variant="primary"
              isLoading={flow.loading}
            >
              Continue
            </SentryButton>
          </form>
        </motion.div>
      )}

      {/* METHOD SELECTION STEP */}
      {!mfaScreen && flow.step === 'method-selection' && flow.loginIntent && (
        <motion.div
          key="method-selection"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-8"
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={flow.goBack}
              className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-accent hover:text-accent/80 transition-colors flex items-center gap-1.5 mb-4"
            >
              &larr; Back to Email
            </button>
            <h2 className="text-xl font-display font-light text-foreground">
              Choose sign-in method
            </h2>
            <p className="text-sm font-body text-muted-foreground">
              Select how you want to authenticate for <span className="text-foreground font-medium">{flow.email}</span>
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                id: 'password',
                label: 'Password',
                description: 'Sign in with your password',
                icon: Lock,
                enabled: flow.loginIntent.methods.password,
              },
              {
                id: 'magicLink',
                label: 'Magic Link',
                description: 'We will send you a login link',
                icon: Mail,
                enabled: flow.loginIntent.methods.magicLink,
              },
              {
                id: 'passkey',
                label: 'Passkey',
                description: 'Use fingerprint or face ID',
                icon: Fingerprint,
                enabled: flow.loginIntent.methods.passkey,
              },
            ]
              .filter(m => m.enabled)
              .map(option => {
                const Icon = option.icon;
                const isPreferred = option.id === flow.loginIntent?.preferredMethod;
                return (
                  <button
                    key={option.id}
                    onClick={() => flow.selectMethod(option.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-sm border transition-all flex items-center justify-between group",
                      isPreferred
                        ? "bg-accent/5 border-accent ring-1 ring-accent/25"
                        : "bg-black/5 hover:bg-black/10 border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-sm transition-colors",
                        isPreferred ? "bg-accent/10 text-accent" : "bg-black/5 text-muted-foreground group-hover:bg-black/10"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-display font-semibold text-xs uppercase tracking-wider text-foreground">{option.label}</p>
                        <p className="text-xs font-body text-muted-foreground/80 mt-0.5">{option.description}</p>
                      </div>
                    </div>
                    {isPreferred && (
                      <span className="text-[9px] font-display font-bold uppercase tracking-widest text-accent bg-accent/10 px-2 py-0.5 rounded-sm">
                        Preferred
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </motion.div>
      )}

      {/* CREDENTIALS STEP */}
      {!mfaScreen && flow.step === 'credentials' && flow.selectedMethod && (
        <motion.div
          key="credentials"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-8"
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={flow.goBack}
              className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-accent hover:text-accent/80 transition-colors flex items-center gap-1.5 mb-4"
            >
              &larr; Back to Methods
            </button>
            <h2 className="text-xl font-display font-light text-foreground">
              {flow.selectedMethod === 'password'
                ? 'Enter password'
                : flow.selectedMethod === 'magicLink'
                ? 'Check your email'
                : 'Use passkey'}
            </h2>
            <p className="text-sm font-body text-muted-foreground">
              Welcome back, <span className="text-foreground font-medium">{flow.email}</span>
            </p>
          </div>

          <AnimatePresence mode="wait">
            {flow.selectedMethod === 'password' && (
              <form onSubmit={handleCredentialsSubmit} className="space-y-6">
                <SentryInput
                  label="Password"
                  name="password"
                  type="password"
                  required
                  error={flow.error || undefined}
                  disabled={flow.loading}
                  autoFocus
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => router.push('/u/forgot-password')}
                    className="text-[11px] font-body text-muted-foreground hover:text-accent transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <SentryButton
                  type="submit"
                  className="w-full"
                  variant="primary"
                  isLoading={flow.loading}
                >
                  Sign In
                </SentryButton>
              </form>
            )}

            {flow.selectedMethod === 'magicLink' && (
              <MagicLinkSection email={flow.email} />
            )}

            {flow.selectedMethod === 'passkey' && (
              <PasskeySection email={flow.email} onSuccess={onSuccess} />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
