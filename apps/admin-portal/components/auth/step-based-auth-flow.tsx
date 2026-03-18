"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEmailAuthFlow } from "@/hooks/use-email-auth-flow";
import { EmailStep } from "./email-step";
import { MethodSelectionStep } from "./method-selection-step";
import { CredentialsStep } from "./credentials-step";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@fortknox/sdk";
import { Button } from "@repo/ui";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

type LoginScreen =
  | 'email'
  | 'credentials'
  | 'mfa_totp'
  | 'mfa_email_otp'
  | 'magic_link_sent'

interface StepBasedAuthFlowProps {
  primaryColor?: string;
}

export function StepBasedAuthFlow({
  primaryColor = "#6366f1",
}: StepBasedAuthFlowProps) {
  const router = useRouter();
  const flow = useEmailAuthFlow();
  const { client, verifyMfaLogin } = useAuth();
  const [passwordPolicy] = useState<any>({
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  });

  // MFA inline state — tempToken is kept in React state only (not localStorage/cookie)
  const [mfaTempToken, setMfaTempToken] = useState<string | null>(null);
  const [mfaScreen, setMfaScreen] = useState<'totp' | 'email_otp' | null>(null);
  const [mfaDigits, setMfaDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const mfaCode = mfaDigits.join("");

  // Determine which top-level screen we are on
  const activeLoginScreen: LoginScreen = (() => {
    if (mfaScreen === 'totp') return 'mfa_totp';
    if (mfaScreen === 'email_otp') return 'mfa_email_otp';
    if (flow.step === 'email') return 'email';
    return 'credentials'; // method-selection or credentials
  })();

  const handleEmailSubmit = async (email: string) => {
    try {
      await flow.submitEmail(email);
    } catch (err) {
      console.error("[StepBasedAuthFlow] Email submission error:", err);
    }
  };

  const handleCredentialsSubmit = async (email: string, password?: string) => {
    try {
      const result = await client.login({ email, password: password as string });

      if (result.mfaRequired) {
        // Store tempToken in local React state only — never in localStorage or cookie
        const tempToken = (result as any).tempToken ?? null;
        setMfaTempToken(tempToken);
        const mfaMethod = (result as any).mfaMethod;
        setMfaScreen(mfaMethod === 'email_otp' ? 'email_otp' : 'totp');
        setMfaDigits(["", "", "", "", "", ""]);
        setMfaError(null);
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      console.error("[StepBasedAuthFlow] Login error:", err);
    }
  };

  const handleMfaChange = (index: number, value: string) => {
    // Handle paste of full code
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, "").slice(0, 6);
      const next = [...mfaDigits];
      for (let i = 0; i < 6; i++) next[i] = cleaned[i] ?? "";
      setMfaDigits(next);
      inputRefs.current[Math.min(cleaned.length, 5)]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, "");
    const next = [...mfaDigits];
    next[index] = digit;
    setMfaDigits(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleMfaKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !mfaDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleMfaSubmit = useCallback(async () => {
    if (mfaCode.length !== 6 || mfaLoading || !mfaTempToken) return;
    setMfaLoading(true);
    setMfaError(null);
    try {
      await verifyMfaLogin(mfaTempToken, mfaCode);
      router.push("/dashboard");
    } catch (err: any) {
      setMfaError(err?.message || "Invalid code. Please try again.");
      setMfaDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setMfaLoading(false);
    }
  }, [mfaCode, mfaLoading, mfaTempToken, verifyMfaLogin, router]);

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if (mfaCode.length === 6 && mfaScreen) handleMfaSubmit();
  }, [mfaCode, mfaScreen, handleMfaSubmit]);

  // MFA TOTP screen
  if (activeLoginScreen === 'mfa_totp') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground">Verify your identity</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Authenticator App</p>
            <p className="text-xs text-muted-foreground">Use an app like Google Authenticator or Authy</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2 justify-center">
            {mfaDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleMfaChange(i, e.target.value)}
                onKeyDown={(e) => handleMfaKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                onPaste={(e) => {
                  if (i === 0) {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                    const next = [...mfaDigits];
                    for (let j = 0; j < 6; j++) next[j] = pasted[j] ?? '';
                    setMfaDigits(next);
                    inputRefs.current[Math.min(pasted.length - 1, 5)]?.focus();
                  }
                }}
                disabled={mfaLoading}
                className={`
                  h-14 w-12 rounded-xl border text-center text-xl font-semibold
                  bg-background transition-all outline-none
                  ${digit ? "border-primary text-foreground" : "border-border text-muted-foreground"}
                  ${mfaLoading ? "opacity-50 cursor-not-allowed" : "focus:border-primary focus:ring-2 focus:ring-primary/20"}
                `}
              />
            ))}
          </div>

          {mfaError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {mfaError}
            </div>
          )}

          <Button
            className="w-full"
            disabled={mfaCode.length !== 6 || mfaLoading}
            style={{ backgroundColor: primaryColor }}
            onClick={handleMfaSubmit}
          >
            {mfaLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify"
            )}
          </Button>

          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline"
            onClick={() => {
              setMfaScreen(null);
              setMfaTempToken(null);
              setMfaDigits(["", "", "", "", "", ""]);
              setMfaError(null);
              flow.reset?.();
            }}
          >
            Back to sign in
          </button>
        </div>
      </motion.div>
    );
  }

  // MFA Email OTP screen
  if (activeLoginScreen === 'mfa_email_otp') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code sent to {flow.email}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2 justify-center">
            {mfaDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleMfaChange(i, e.target.value)}
                onKeyDown={(e) => handleMfaKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                disabled={mfaLoading}
                className={`
                  h-14 w-12 rounded-xl border text-center text-xl font-semibold
                  bg-background transition-all outline-none
                  ${digit ? "border-primary text-foreground" : "border-border text-muted-foreground"}
                  ${mfaLoading ? "opacity-50 cursor-not-allowed" : "focus:border-primary focus:ring-2 focus:ring-primary/20"}
                `}
              />
            ))}
          </div>

          {mfaError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {mfaError}
            </div>
          )}

          <Button
            className="w-full"
            disabled={mfaCode.length !== 6 || mfaLoading}
            style={{ backgroundColor: primaryColor }}
            onClick={handleMfaSubmit}
          >
            {mfaLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify"
            )}
          </Button>

          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline"
            onClick={() => {
              setMfaScreen(null);
              setMfaTempToken(null);
              setMfaDigits(["", "", "", "", "", ""]);
              setMfaError(null);
              flow.reset?.();
            }}
          >
            Back to sign in
          </button>
        </div>
      </motion.div>
    );
  }

  // Normal login flow (email → method selection → credentials)
  return (
    <AnimatePresence mode="wait">
      {flow.step === "email" && (
        <EmailStep
          key="email"
          onSubmit={handleEmailSubmit}
          loading={flow.loading}
          error={flow.error}
          primaryColor={primaryColor}
        />
      )}

      {flow.step === "method-selection" && flow.loginIntent && (
        <MethodSelectionStep
          key="methods"
          loginIntent={flow.loginIntent}
          onSelectMethod={flow.selectMethod}
          onChangeEmail={flow.goBack}
          loading={flow.loading}
          primaryColor={primaryColor}
        />
      )}

      {flow.step === "credentials" &&
        flow.selectedMethod &&
        flow.loginIntent && (
          <CredentialsStep
            key="credentials"
            email={flow.email}
            method={flow.selectedMethod}
            onSubmit={handleCredentialsSubmit}
            onBack={flow.goBack}
            loading={flow.loading}
            error={flow.error}
            passwordPolicy={passwordPolicy}
            primaryColor={primaryColor}
          />
        )}
    </AnimatePresence>
  );
}
