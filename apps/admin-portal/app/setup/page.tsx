"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { WizardLayout } from "@/components/onboarding/WizardLayout";
import { WizardCard } from "@/components/onboarding/WizardCard";
import { WizardField, inputBase } from "@/components/onboarding/WizardField";
import { PasswordStrength } from "@/components/onboarding/PasswordStrength";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";

const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4000";

const T = {
  mint: "#2ABF6C",
  mintSoft: "rgba(42,191,108,0.10)",
  onyx: "#1A1A1A",
  stone: "#605E5A",
  platinum: "#D9D1C5",
  error: "#ba1a1a",
  errorSoft: "rgba(186,26,26,0.08)",
} as const;

const LEFT_FEATURES = [
  "Multi-tenant with schema-level isolation",
  "AWS IAM-level RBAC & policy engine",
  "WebAuthn, TOTP, and magic-link MFA",
  "SOC 2 Type II ready from day one",
];

type Step = 1 | 2 | 3 | 4;

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [fading, setFading] = useState(false);

  const [setupToken, setSetupToken] = useState("");
  const [platformName, setPlatformName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch log file hint on mount
  const [logHint, setLogHint] = useState<{ path: string | null; hint: string } | null>(null);
  useEffect(() => {
    const fetchLogHint = withErrorHandler<[], { path: string | null; hint: string }>(
      async () => authClient.request({
        url: `${AUTH_SERVICE_URL}/superadmin/setup-log-hint`,
        method: "GET"
      }),
      { showErrorToast: false }
    );
    fetchLogHint().then((d) => setLogHint(d)).catch(() => null);
  }, []);

  const goTo = useCallback((target: Step) => {
    setError(null);
    setFading(true);
    setTimeout(() => {
      setStep(target);
      setFading(false);
    }, 180);
  }, []);

  async function handleCreate() {
    setError(null);
    setIsLoading(true);

    const createAdminFn = withErrorHandler<[], any>(
      async () => {
        const res = await authClient.request({
          url: `${AUTH_SERVICE_URL}/superadmin/create-first-admin`,
          method: "POST",
          headers: {
            "X-Setup-Token": setupToken.trim(),
          },
          body: {
            platformName: platformName.trim() || undefined,
            name: name.trim(),
            email: email.trim(),
            password,
          },
        });

        if (res.status === 409) {
          throw new Error("Platform already initialized.");
        }
        if (res.status === 403) {
          throw new Error("Invalid setup token. Check the auth service logs.");
        }
        return res;
      },
      { showErrorToast: true }
    );

    try {
      await createAdminFn();

      // Mark platform as initialized so the middleware doesn't bounce
      // the user back to /setup when they navigate to /u/login.
      document.cookie = 'sentry-initialized=1; Max-Age=300; path=/; SameSite=Lax';
      goTo(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const canCreate = name.trim() && email.trim() && password.length > 0 && !isLoading;

  return (
    <WizardLayout
      leftTitle={"Enterprise identity,\nengineered for trust."}
      leftTagline="This wizard takes under 2 minutes. At the end you'll have a fully initialized platform ready for your first tenant."
      leftFeatures={LEFT_FEATURES}
    >
      {step < 4 && <StepIndicator total={3} current={step === 1 ? 1 : step === 2 ? 2 : 3} />}

      <WizardCard fading={fading}>
        {/* ─ Step 1: Setup Token ─ */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            <div>
              <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "21px", fontWeight: 600, color: T.onyx, lineHeight: 1.25, marginBottom: "6px" }}>
                Enter your setup token
              </h2>
              <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                Generated once at startup — find it in the auth service logs.
              </p>
            </div>

            <WizardField label="Setup Token">
              <input
                type="text"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setupToken.trim() && goTo(2)}
                placeholder="e.g. a3f9c2d1..."
                style={{ ...inputBase, fontFamily: "JetBrains Mono, monospace", fontSize: "13px", letterSpacing: "0.04em" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
              />
              <p style={{ fontSize: "11px", color: T.stone, lineHeight: 1.6, marginTop: "7px" }}>
                {logHint?.path ? (
                  <>
                    Run:{" "}
                    <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", background: "rgba(0,0,0,0.05)", padding: "1px 5px", borderRadius: "3px" }}>
                      cat &quot;{logHint.path}&quot;
                    </code>
                  </>
                ) : (
                  <>
                    Run:{" "}
                    <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", background: "rgba(0,0,0,0.05)", padding: "1px 5px", borderRadius: "3px" }}>
                      docker logs auth-service | grep &quot;SETUP TOKEN&quot;
                    </code>
                  </>
                )}
              </p>
            </WizardField>

            <button
              type="button"
              disabled={!setupToken.trim()}
              onClick={() => goTo(2)}
              style={{
                width: "100%", padding: "12px", borderRadius: "4px",
                background: setupToken.trim() ? T.onyx : "rgba(0,0,0,0.10)",
                color: setupToken.trim() ? "#fff" : T.stone,
                fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
                cursor: setupToken.trim() ? "pointer" : "default",
                border: "none", transition: "all 160ms ease",
              }}
            >
              Begin Setup →
            </button>
          </div>
        )}

        {/* ─ Step 2: Platform Name ─ */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            <div>
              <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "21px", fontWeight: 600, color: T.onyx, lineHeight: 1.25, marginBottom: "6px" }}>
                Name your platform
              </h2>
              <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                Shown across dashboards and emails. You can change it later.
              </p>
            </div>

            <WizardField label="Platform Name">
              <input
                type="text"
                autoFocus
                autoComplete="off"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goTo(3)}
                placeholder="Scrolloop Sentry"
                style={inputBase}
                onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
              />
              <p style={{ fontSize: "11px", color: T.stone, marginTop: "7px" }}>
                Leave blank to use the default name.
              </p>
            </WizardField>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => goTo(1)}
                style={{
                  padding: "12px 14px", borderRadius: "4px", background: "transparent",
                  color: T.stone, fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
                  border: `1px solid ${T.platinum}`, display: "flex", alignItems: "center", gap: "5px",
                  transition: "all 160ms ease",
                }}
              >
                <ArrowLeft style={{ width: "13px", height: "13px" }} strokeWidth={2} />
                Back
              </button>
              <button
                type="button"
                onClick={() => goTo(3)}
                style={{
                  flex: 1, padding: "12px", borderRadius: "4px", background: T.onyx, color: "#fff",
                  fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
                  border: "none", transition: "all 160ms ease",
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ─ Step 3: Admin Account ─ */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "21px", fontWeight: 600, color: T.onyx, lineHeight: 1.25, marginBottom: "6px" }}>
                Create the admin account
              </h2>
              <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                This account gets full superadmin access across the platform.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <WizardField label="Full Name">
                <input
                  type="text" autoFocus autoComplete="name" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace"
                  style={inputBase}
                  onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                />
              </WizardField>

              <WizardField label="Email Address">
                <input
                  type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="admin@yourdomain.com"
                  style={inputBase}
                  onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                />
              </WizardField>

              <WizardField label="Password">
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"} autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose a strong password"
                    style={{ ...inputBase, paddingRight: "44px" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: T.stone,
                      padding: "4px", display: "flex", alignItems: "center",
                    }}
                  >
                    {showPassword
                      ? <EyeOff style={{ width: "15px", height: "15px" }} strokeWidth={1.75} />
                      : <Eye style={{ width: "15px", height: "15px" }} strokeWidth={1.75} />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </WizardField>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "11px 13px", borderRadius: "4px", background: T.errorSoft, border: "1px solid rgba(186,26,26,0.18)" }}>
                <AlertCircle style={{ width: "15px", height: "15px", color: T.error, flexShrink: 0, marginTop: "1px" }} strokeWidth={1.75} />
                <span style={{ fontSize: "13px", color: T.error, lineHeight: 1.55 }}>
                  {error}
                  {error.includes("already initialized") && (
                    <>{" "}<a href="/u/login" style={{ textDecoration: "underline" }}>Go to login →</a></>
                  )}
                </span>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button" onClick={() => goTo(2)} disabled={isLoading}
                style={{
                  padding: "12px 14px", borderRadius: "4px", background: "transparent",
                  color: T.stone, fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  cursor: isLoading ? "default" : "pointer",
                  border: `1px solid ${T.platinum}`, display: "flex", alignItems: "center",
                  gap: "5px", opacity: isLoading ? 0.45 : 1, transition: "all 160ms ease",
                }}
              >
                <ArrowLeft style={{ width: "13px", height: "13px" }} strokeWidth={2} />
                Back
              </button>
              <button
                type="button" onClick={handleCreate} disabled={!canCreate}
                style={{
                  flex: 1, padding: "12px", borderRadius: "4px",
                  background: canCreate ? T.mint : "rgba(0,0,0,0.10)",
                  color: canCreate ? T.onyx : T.stone,
                  fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  cursor: canCreate ? "pointer" : "default", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                  transition: "all 160ms ease",
                }}
              >
                {isLoading ? (
                  <><Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" strokeWidth={2} /> Creating...</>
                ) : "Create Platform →"}
              </button>
            </div>
          </div>
        )}

        {/* ─ Step 4: Success ─ */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "20px", padding: "12px 0" }}>
            <div
              style={{
                width: "60px", height: "60px", borderRadius: "9999px",
                background: T.mintSoft, border: "1.5px solid rgba(42,191,108,0.30)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "sentryScaleIn 380ms cubic-bezier(0.4,0,0.2,1) both",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                <path d="M5 13l5.6 5.6L21 7" stroke={T.mint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div>
              <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "21px", fontWeight: 600, color: T.onyx, lineHeight: 1.25, marginBottom: "8px" }}>
                Your platform is ready.
              </h2>
              <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                <strong style={{ color: T.onyx }}>{platformName.trim() || "Scrolloop Sentry"}</strong> is initialized.
                <br />Sign in to start building.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.replace("/u/login")}
              style={{
                padding: "12px 28px", borderRadius: "4px", background: T.mint, color: T.onyx,
                fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
                border: "none", marginTop: "6px", transition: "all 160ms ease",
              }}
            >
              Go to Login →
            </button>
          </div>
        )}
      </WizardCard>

      <style>{`
        @keyframes sentryScaleIn {
          from { transform: scale(0.55); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </WizardLayout>
  );
}
