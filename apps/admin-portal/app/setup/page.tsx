"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Check,
} from "lucide-react";

const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4000";

// Stitch design system — Titanium & Mint
const T = {
  bg: "#F7F6F4",
  editorial: "#1A1916",
  glass2: "rgba(255,255,255,0.40)",
  platinum: "#D9D1C5",
  mint: "#2ABF6C",
  mintSoft: "rgba(42,191,108,0.10)",
  onyx: "#1A1A1A",
  stone: "#605E5A",
  error: "#ba1a1a",
  errorSoft: "rgba(186,26,26,0.08)",
} as const;

// Strength: 1 criteria per segment (length≥8, upper, digit, symbol, length≥16)
function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 16) s++;
  return s;
}

const STRENGTH_LABELS = ["", "Too weak", "Weak", "Fair", "Strong", "Very strong"] as const;
const STRENGTH_COLORS = ["#D9D1C5", "#ba1a1a", "#C4830A", "#C4830A", "#2ABF6C", "#2ABF6C"] as const;

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = scorePassword(password);
  const fill = STRENGTH_COLORS[score] ?? "#D9D1C5";
  const label = STRENGTH_LABELS[score] ?? "";
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: "3px",
              borderRadius: "9999px",
              background: i <= score ? fill : T.platinum,
              transition: "background 180ms ease",
            }}
          />
        ))}
      </div>
      {label && (
        <p
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: fill,
            marginTop: "5px",
          }}
        >
          {label}
        </p>
      )}
    </div>
  );
}

const inputBase: React.CSSProperties = {
  width: "100%",
  borderRadius: "4px",
  padding: "11px 14px",
  fontSize: "15px",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 400,
  outline: "none",
  background: "rgba(255,255,255,0.72)",
  border: `1px solid ${T.platinum}`,
  color: T.onyx,
  boxSizing: "border-box",
  transition: "border-color 140ms ease",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontFamily: "Montserrat, sans-serif",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.stone,
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

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
    try {
      const res = await fetch(
        `${AUTH_SERVICE_URL}/superadmin/create-first-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Setup-Token": setupToken.trim(),
          },
          body: JSON.stringify({
            platformName: platformName.trim() || undefined,
            name: name.trim(),
            email: email.trim(),
            password,
          }),
        },
      );

      if (res.status === 409) {
        setError("Platform already initialized.");
        return;
      }
      if (res.status === 403) {
        setError("Invalid setup token. Check the auth service startup logs.");
        return;
      }
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        setError(
          typeof body.message === "string"
            ? body.message
            : "An unexpected error occurred.",
        );
        return;
      }

      goTo(4);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const canCreate = name.trim() && email.trim() && password.length > 0 && !isLoading;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: T.bg,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {/* ── Left editorial panel ─────────────────────────── */}
      <div
        style={{
          display: "none",
          width: "42%",
          background: T.editorial,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 52px",
          position: "relative",
          overflow: "hidden",
        }}
        className="setup-left-panel"
      >
        {/* Subtle mint glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 55% 45% at 15% 85%, rgba(42,191,108,0.07) 0%, transparent 70%)",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "60px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "4px",
                background: T.mintSoft,
                border: "1px solid rgba(42,191,108,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck
                style={{ width: "16px", height: "16px", color: T.mint }}
                strokeWidth={1.75}
              />
            </div>
            <span
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "15px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.90)",
                letterSpacing: "-0.01em",
              }}
            >
              Scrolloop{" "}
              <span style={{ color: T.mint }}>Sentry</span>
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: "44px" }}>
            <h1
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "34px",
                fontWeight: 300,
                lineHeight: 1.18,
                color: "rgba(255,255,255,0.93)",
                letterSpacing: "-0.02em",
                marginBottom: "14px",
              }}
            >
              Enterprise identity,
              <br />
              <em style={{ fontStyle: "italic", fontWeight: 300 }}>
                engineered
              </em>{" "}
              for trust.
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.40)",
                lineHeight: 1.7,
                maxWidth: "290px",
              }}
            >
              This wizard takes under 2 minutes. At the end you'll have a
              fully initialized platform ready for your first tenant.
            </p>
          </div>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {[
              "Multi-tenant with schema-level isolation",
              "AWS IAM-level RBAC & policy engine",
              "WebAuthn, TOTP, and magic-link MFA",
              "SOC 2 Type II ready from day one",
            ].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "9999px",
                    background: T.mintSoft,
                    border: "1px solid rgba(42,191,108,0.28)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  <div
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "9999px",
                      background: T.mint,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.50)",
                    lineHeight: 1.55,
                  }}
                >
                  {f}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "Montserrat, sans-serif",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.18)",
          }}
        >
          Scrolloop Sentry · First-Run Setup
        </p>
      </div>

      {/* ── Right form panel ──────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "420px" }}>

          {/* Step indicator */}
          {step < 4 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "28px",
              }}
            >
              {([1, 2, 3] as const).map((s) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "9999px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background:
                        step > s ? T.mint : step === s ? T.onyx : "transparent",
                      border:
                        step > s
                          ? "none"
                          : step === s
                          ? "none"
                          : `1.5px solid ${T.platinum}`,
                      transition: "all 280ms cubic-bezier(0.4,0,0.2,1)",
                    }}
                  >
                    {step > s ? (
                      <Check
                        style={{ width: "11px", height: "11px", color: "#fff" }}
                        strokeWidth={2.5}
                      />
                    ) : (
                      <span
                        style={{
                          fontFamily: "Montserrat, sans-serif",
                          fontSize: "10px",
                          fontWeight: 700,
                          color: step === s ? "#fff" : T.stone,
                        }}
                      >
                        {s}
                      </span>
                    )}
                  </div>
                  {s < 3 && (
                    <div
                      style={{
                        width: "28px",
                        height: "1px",
                        background: step > s ? T.mint : T.platinum,
                        transition: "background 280ms ease",
                      }}
                    />
                  )}
                </div>
              ))}
              <span
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: T.stone,
                  marginLeft: "6px",
                }}
              >
                {step === 1 ? "Setup Token" : step === 2 ? "Platform" : "Admin Account"}
              </span>
            </div>
          )}

          {/* Glass card */}
          <div
            style={{
              background: T.glass2,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${T.platinum}`,
              borderRadius: "8px",
              padding: "36px",
              boxShadow:
                "0 8px 40px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.55)",
              opacity: fading ? 0 : 1,
              transform: fading ? "translateY(10px)" : "translateY(0)",
              transition:
                "opacity 180ms cubic-bezier(0.4,0,0.2,1), transform 180ms cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            {/* ─ Step 1: Setup Token ─ */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                <div>
                  <h2
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "21px",
                      fontWeight: 600,
                      color: T.onyx,
                      lineHeight: 1.25,
                      marginBottom: "6px",
                    }}
                  >
                    Enter your setup token
                  </h2>
                  <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                    Generated once at startup — find it in the auth service logs.
                  </p>
                </div>

                <Field label="Setup Token">
                  <input
                    type="text"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setupToken.trim() && goTo(2)}
                    placeholder="e.g. a3f9c2d1..."
                    style={{
                      ...inputBase,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "13px",
                      letterSpacing: "0.04em",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                  />
                  <p
                    style={{
                      fontSize: "11px",
                      color: T.stone,
                      lineHeight: 1.6,
                      marginTop: "7px",
                    }}
                  >
                    Run:{" "}
                    <code
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "11px",
                        background: "rgba(0,0,0,0.05)",
                        padding: "1px 5px",
                        borderRadius: "3px",
                      }}
                    >
                      docker logs auth-service | grep &quot;SETUP TOKEN&quot;
                    </code>
                  </p>
                </Field>

                <button
                  type="button"
                  disabled={!setupToken.trim()}
                  onClick={() => goTo(2)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "4px",
                    background: setupToken.trim() ? T.onyx : "rgba(0,0,0,0.10)",
                    color: setupToken.trim() ? "#fff" : T.stone,
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: setupToken.trim() ? "pointer" : "default",
                    border: "none",
                    transition: "all 160ms ease",
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
                  <h2
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "21px",
                      fontWeight: 600,
                      color: T.onyx,
                      lineHeight: 1.25,
                      marginBottom: "6px",
                    }}
                  >
                    Name your platform
                  </h2>
                  <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                    Shown across dashboards and emails. You can change it later.
                  </p>
                </div>

                <Field label="Platform Name">
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
                </Field>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => goTo(1)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "4px",
                      background: "transparent",
                      color: T.stone,
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      border: `1px solid ${T.platinum}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
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
                      flex: 1,
                      padding: "12px",
                      borderRadius: "4px",
                      background: T.onyx,
                      color: "#fff",
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      border: "none",
                      transition: "all 160ms ease",
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
                  <h2
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "21px",
                      fontWeight: 600,
                      color: T.onyx,
                      lineHeight: 1.25,
                      marginBottom: "6px",
                    }}
                  >
                    Create the admin account
                  </h2>
                  <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                    This account gets full superadmin access across the platform.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  <Field label="Full Name">
                    <input
                      type="text"
                      autoFocus
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ada Lovelace"
                      style={inputBase}
                      onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                    />
                  </Field>

                  <Field label="Email Address">
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@yourdomain.com"
                      style={inputBase}
                      onFocus={(e) => (e.currentTarget.style.borderColor = T.mint)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = T.platinum)}
                    />
                  </Field>

                  <Field label="Password">
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
                          position: "absolute",
                          right: "12px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: T.stone,
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {showPassword ? (
                          <EyeOff style={{ width: "15px", height: "15px" }} strokeWidth={1.75} />
                        ) : (
                          <Eye style={{ width: "15px", height: "15px" }} strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                    <PasswordStrength password={password} />
                  </Field>
                </div>

                {error && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "11px 13px",
                      borderRadius: "4px",
                      background: T.errorSoft,
                      border: `1px solid rgba(186,26,26,0.18)`,
                    }}
                  >
                    <AlertCircle
                      style={{ width: "15px", height: "15px", color: T.error, flexShrink: 0, marginTop: "1px" }}
                      strokeWidth={1.75}
                    />
                    <span style={{ fontSize: "13px", color: T.error, lineHeight: 1.55 }}>
                      {error}
                      {error.includes("already initialized") && (
                        <>
                          {" "}
                          <a href="/u/login" style={{ textDecoration: "underline" }}>
                            Go to login →
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => goTo(2)}
                    disabled={isLoading}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "4px",
                      background: "transparent",
                      color: T.stone,
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: isLoading ? "default" : "pointer",
                      border: `1px solid ${T.platinum}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      opacity: isLoading ? 0.45 : 1,
                      transition: "all 160ms ease",
                    }}
                  >
                    <ArrowLeft style={{ width: "13px", height: "13px" }} strokeWidth={2} />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!canCreate}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: "4px",
                      background: canCreate ? T.mint : "rgba(0,0,0,0.10)",
                      color: canCreate ? T.onyx : T.stone,
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      cursor: canCreate ? "pointer" : "default",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "7px",
                      transition: "all 160ms ease",
                    }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2
                          style={{ width: "14px", height: "14px" }}
                          className="animate-spin"
                          strokeWidth={2}
                        />
                        Creating...
                      </>
                    ) : (
                      "Create Platform →"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ─ Step 4: Success ─ */}
            {step === 4 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: "20px",
                  padding: "12px 0",
                }}
              >
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "9999px",
                    background: T.mintSoft,
                    border: "1.5px solid rgba(42,191,108,0.30)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: "sentryScaleIn 380ms cubic-bezier(0.4,0,0.2,1) both",
                  }}
                >
                  <Check
                    style={{ width: "26px", height: "26px", color: T.mint }}
                    strokeWidth={2}
                  />
                </div>

                <div>
                  <h2
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "21px",
                      fontWeight: 600,
                      color: T.onyx,
                      lineHeight: 1.25,
                      marginBottom: "8px",
                    }}
                  >
                    Your platform is ready.
                  </h2>
                  <p style={{ fontSize: "14px", color: T.stone, lineHeight: 1.65 }}>
                    <strong style={{ color: T.onyx }}>
                      {platformName.trim() || "Scrolloop Sentry"}
                    </strong>{" "}
                    is initialized.
                    <br />
                    Sign in to start building.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => router.replace("/u/login")}
                  style={{
                    padding: "12px 28px",
                    borderRadius: "4px",
                    background: T.mint,
                    color: T.onyx,
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    border: "none",
                    marginTop: "6px",
                    transition: "all 160ms ease",
                  }}
                >
                  Go to Login →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .setup-left-panel {
            display: flex !important;
          }
        }
        @keyframes sentryScaleIn {
          from { transform: scale(0.55); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
