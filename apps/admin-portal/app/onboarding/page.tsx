"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowLeft, Check, X } from "lucide-react";
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
  "Your own subdomain in seconds",
  "Full RBAC with owner, admin, and member roles",
  "Invite team members and external users",
  "SSO, MFA, and WebAuthn built in",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

type SlugState = "idle" | "checking" | "available" | "taken" | "invalid";
type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [fading, setFading] = useState(false);

  const [workspaceName, setWorkspaceName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>("idle");
  const [slugReason, setSlugReason] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState("");

  const goTo = useCallback((target: Step) => {
    setError(null);
    setFading(true);
    setTimeout(() => {
      setStep(target);
      setFading(false);
    }, 180);
  }, []);

  // Auto-derive slug from workspace name unless manually edited
  useEffect(() => {
    if (!slugManual && workspaceName) {
      setSlug(slugify(workspaceName));
    }
  }, [workspaceName, slugManual]);

  // Debounced slug availability check
  useEffect(() => {
    if (!slug) { setSlugState("idle"); return; }

    // Basic local validation
    if (slug.length < 4) { setSlugState("invalid"); setSlugReason("Minimum 4 characters"); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) { setSlugState("invalid"); setSlugReason("Lowercase letters, numbers, and hyphens only"); return; }

    setSlugState("checking");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const checkSlugFn = withErrorHandler<[], { available: boolean; reason?: string }>(
          async () => authClient.request({
            url: `${AUTH_SERVICE_URL}/tenants/slug-check?slug=${encodeURIComponent(slug)}`,
            method: "GET"
          }),
          { showErrorToast: false }
        );
        const data = await checkSlugFn();
        if (data.available) {
          setSlugState("available");
          setSlugReason("");
        } else {
          setSlugState("taken");
          setSlugReason(data.reason ?? "This slug is taken");
        }
      } catch {
        setSlugState("idle");
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [slug]);

  async function handleRegister() {
    setError(null);
    setIsLoading(true);

    const registerFn = withErrorHandler<[], any>(
      async () => {
        const res = await authClient.request({
          url: `${AUTH_SERVICE_URL}/tenants/register`,
          method: "POST",
          body: {
            workspaceName: workspaceName.trim(),
            slug: slug.trim(),
            adminName: adminName.trim(),
            adminEmail: adminEmail.trim(),
            adminPassword,
          },
        });

        if (res.status === 409) {
          throw new Error("That workspace slug was just taken. Try another.");
        }
        if (res.status === 429) {
          throw new Error("Too many attempts. Please try again later.");
        }
        return res;
      },
      { showErrorToast: true }
    );

    try {
      await registerFn();
      setCreatedSlug(slug);
      goTo(3);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const step1Valid = workspaceName.trim().length > 0 && slugState === "available";
  const canRegister = adminName.trim() && adminEmail.trim() && adminPassword.length > 0 && !isLoading;

  return (
    <WizardLayout
      leftTitle={"Your workspace.\nYour rules."}
      leftTagline="Set up in under 2 minutes. Everything you need to start authenticating users — right out of the box."
      leftFeatures={LEFT_FEATURES}
    >
      {step < 3 && <StepIndicator total={2} current={step} />}

      <WizardCard fading={fading}>
        {/* ─ Step 1: Workspace Identity ─ */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            <div>
              <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "21px", fontWeight: 600, color: T.onyx, lineHeight: 1.25, marginBottom: "6px" }}>
                Name your workspace
              </h2>
              <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                This is how your team and users will identify your workspace.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <WizardField label="Workspace Name">
                <input
                  type="text"
                  autoFocus
                  autoComplete="organization"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Acme Corp"
                  style={inputBase}
                  onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                />
              </WizardField>

              <WizardField label="Subdomain">
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={slug}
                    onChange={(e) => {
                      setSlugManual(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    placeholder="acme"
                    style={{
                      ...inputBase,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "13px",
                      paddingRight: "130px",
                      borderColor:
                        slugState === "available"
                          ? T.mint
                          : slugState === "taken" || slugState === "invalid"
                          ? T.error
                          : T.platinum,
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = slugState === "taken" || slugState === "invalid" ? T.error : T.mint)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = slugState === "available" ? T.mint : slugState === "taken" || slugState === "invalid" ? T.error : T.platinum)}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: "12px",
                      color: T.stone,
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    .sentry.scrolloop.com
                  </span>
                </div>

                {/* Slug status */}
                {slugState === "checking" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "7px" }}>
                    <Loader2 style={{ width: "11px", height: "11px", color: T.stone }} className="animate-spin" />
                    <span style={{ fontSize: "11px", color: T.stone }}>Checking availability…</span>
                  </div>
                )}
                {slugState === "available" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "7px" }}>
                    <Check style={{ width: "11px", height: "11px", color: T.mint }} strokeWidth={2.5} />
                    <span style={{ fontSize: "11px", color: T.mint }}>{slug}.sentry.scrolloop.com is available</span>
                  </div>
                )}
                {(slugState === "taken" || slugState === "invalid") && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "7px" }}>
                    <X style={{ width: "11px", height: "11px", color: T.error }} strokeWidth={2.5} />
                    <span style={{ fontSize: "11px", color: T.error }}>{slugReason}</span>
                  </div>
                )}
              </WizardField>
            </div>

            <button
              type="button"
              disabled={!step1Valid}
              onClick={() => goTo(2)}
              style={{
                width: "100%", padding: "12px", borderRadius: "4px",
                background: step1Valid ? T.onyx : "rgba(0,0,0,0.10)",
                color: step1Valid ? "#fff" : T.stone,
                fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
                cursor: step1Valid ? "pointer" : "default",
                border: "none", transition: "all 160ms ease",
              }}
            >
              Continue →
            </button>

            <p style={{ textAlign: "center", fontSize: "13px", color: T.stone, marginTop: "-8px" }}>
              Already have a workspace?{" "}
              <a href="/u/login" style={{ color: T.mint, textDecoration: "none" }}>Sign in →</a>
            </p>
          </div>
        )}

        {/* ─ Step 2: Admin Account ─ */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "21px", fontWeight: 600, color: T.onyx, lineHeight: 1.25, marginBottom: "6px" }}>
                Create your account
              </h2>
              <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                You'll be the owner of{" "}
                <strong style={{ color: T.onyx, fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}>{slug}</strong>.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <WizardField label="Full Name">
                <input
                  type="text" autoFocus autoComplete="name" value={adminName}
                  onChange={(e) => setAdminName(e.target.value)} placeholder="Ada Lovelace"
                  style={inputBase}
                  onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                />
              </WizardField>

              <WizardField label="Email Address">
                <input
                  type="email" autoComplete="email" value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)} placeholder="you@yourdomain.com"
                  style={inputBase}
                  onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                />
              </WizardField>

              <WizardField label="Password">
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"} autoComplete="new-password"
                    value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
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
                <PasswordStrength password={adminPassword} />
              </WizardField>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "11px 13px", borderRadius: "4px", background: T.errorSoft, border: "1px solid rgba(186,26,26,0.18)" }}>
                <AlertCircle style={{ width: "15px", height: "15px", color: T.error, flexShrink: 0, marginTop: "1px" }} strokeWidth={1.75} />
                <span style={{ fontSize: "13px", color: T.error, lineHeight: 1.55 }}>{error}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button" onClick={() => goTo(1)} disabled={isLoading}
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
                type="button" onClick={handleRegister} disabled={!canRegister}
                style={{
                  flex: 1, padding: "12px", borderRadius: "4px",
                  background: canRegister ? T.mint : "rgba(0,0,0,0.10)",
                  color: canRegister ? T.onyx : T.stone,
                  fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  cursor: canRegister ? "pointer" : "default", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                  transition: "all 160ms ease",
                }}
              >
                {isLoading
                  ? <><Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" strokeWidth={2} /> Creating…</>
                  : "Create Workspace →"}
              </button>
            </div>
          </div>
        )}

        {/* ─ Step 3: Success ─ */}
        {step === 3 && (
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
                Your workspace is ready.
              </h2>
              <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                <strong style={{ color: T.onyx }}>{workspaceName}</strong> is live at{" "}
                <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
                  {createdSlug}.sentry.scrolloop.com
                </code>
                .
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.replace(`/t/${createdSlug}/dashboard`)}
              style={{
                padding: "12px 28px", borderRadius: "4px", background: T.mint, color: T.onyx,
                fontFamily: "Montserrat, sans-serif", fontSize: "12px", fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
                border: "none", marginTop: "6px", transition: "all 160ms ease",
              }}
            >
              Go to Dashboard →
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
