'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useEmailAuthFlow } from '@/hooks/use-email-auth-flow';
import { useAuth } from '@fortknox/sdk';
import { SentryButton, SentryInput } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";
import { ShieldCheck, AlertCircle, Loader2, Github, Mail } from 'lucide-react';



export function SentryAuthFlow() {
  const router = useRouter();
  const flow = useEmailAuthFlow();
  const { client, verifyMfaLogin } = useAuth();

  // MFA inline state
  const [mfaTempToken, setMfaTempToken] = React.useState<string | null>(null);
  const [mfaScreen, setMfaScreen] = React.useState<'totp' | 'email_otp' | null>(null);
  const [mfaDigits, setMfaDigits] = React.useState<string[]>(['', '', '', '', '', '']);
  const [mfaLoading, setMfaLoading] = React.useState(false);
  const [mfaError, setMfaError] = React.useState<string | null>(null);
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const mfaCode = mfaDigits.join('');

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

      if (result.mfaRequired) {
        const tempToken = (result as any).tempToken ?? null;
        setMfaTempToken(tempToken);
        const mfaMethod = (result as any).mfaMethod;
        setMfaScreen(mfaMethod === 'email_otp' ? 'email_otp' : 'totp');
        setMfaDigits(['', '', '', '', '', '']);
        setMfaError(null);
        return;
      }

      router.push('/dashboard');
    } catch (err: any) {
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
      router.push('/dashboard');
    } catch (err: any) {
      setMfaError(err?.message || 'Invalid code. Please try again.');
      setMfaDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setMfaLoading(false);
    }
  }, [mfaCode, mfaLoading, mfaTempToken, verifyMfaLogin, router]);

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
                : `Enter the code sent to ${flow.email}`}
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
        <motion.form
          key="email"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          onSubmit={handleEmailSubmit}
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

          <div className="space-y-6">
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
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] font-display font-bold uppercase tracking-[0.1em]">
              <span className="bg-card px-3 text-muted-foreground/50">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <SentryButton variant="ghost" size="sm" className="h-10" aria-label="Sign in with Google">
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.18 1-.78 1.85-1.63 2.42v2.01h2.64c1.55-1.42 2.44-3.51 2.44-5.94z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-2.64-2.01c-.73.49-1.66.78-2.64.78-2.83 0-5.23-1.92-6.08-4.5H2.18v2.08C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.92 14.61c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V8.31H2.18C1.41 9.87 1 11.61 1 13.25c0 1.64.41 3.38 1.18 4.94l3.74-3.58z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.74 3.58c.85-2.58 3.25-4.5 6.08-4.5z" fill="#EA4335" />
              </svg>
            </SentryButton>
            <SentryButton variant="ghost" size="sm" className="h-10" aria-label="Sign in with GitHub">
              <Github className="h-4 w-4" />
            </SentryButton>
            <SentryButton variant="ghost" size="sm" className="h-10" aria-label="Sign in with Microsoft">
              <svg className="h-4 w-4" viewBox="0 0 23 23">
                <path fill="#f3f2f1" d="M1 1h10v10H1z" />
                <path fill="#f3f2f1" d="M12 1h10v10H12z" />
                <path fill="#f3f2f1" d="M1 12h10v10H1z" />
                <path fill="#f3f2f1" d="M12 12h10v10H12z" />
                <path fill="#7c7c7c" d="M1 1h10v10H1z" />
                <path fill="#7c7c7c" d="M12 1h10v10H12z" />
                <path fill="#7c7c7c" d="M1 12h10v10H1z" />
                <path fill="#7c7c7c" d="M12 12h10v10H12z" />
              </svg>
            </SentryButton>
          </div>
        </motion.form>
      )}

      {/* CREDENTIALS STEP */}
      {!mfaScreen && flow.step === 'credentials' && (
        <motion.form
          key="credentials"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          onSubmit={handleCredentialsSubmit}
          className="space-y-8"
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={flow.goBack}
              className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-accent hover:text-accent-dark transition-colors flex items-center gap-1.5 mb-4"
            >
              &larr; Back to Email
            </button>
            <h2 className="text-xl font-display font-light text-foreground">
              Enter password
            </h2>
            <p className="text-sm font-body text-muted-foreground">
              Welcome back, <span className="text-foreground font-medium">{flow.email}</span>
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-1">
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
            </div>

            <SentryButton
              type="submit"
              className="w-full"
              variant="primary"
              isLoading={flow.loading}
            >
              Sign In
            </SentryButton>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
