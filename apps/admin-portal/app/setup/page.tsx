"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:3001";

interface ApiError {
  message: string;
  statusCode?: number;
}

export default function SetupPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string).trim();
    const email = (formData.get("email") as string).trim();
    const password = formData.get("password") as string;
    const setupToken = (formData.get("setupToken") as string).trim();

    try {
      const res = await fetch(
        `${AUTH_SERVICE_URL}/superadmin/create-first-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Setup-Token": setupToken,
          },
          body: JSON.stringify({ name, email, password }),
        },
      );

      if (res.status === 409) {
        setError(
          "System already set up. Redirecting to login...",
        );
        setTimeout(() => router.replace("/u/login"), 2000);
        return;
      }

      if (!res.ok) {
        const body = (await res.json()) as ApiError;
        setError(
          typeof body.message === "string"
            ? body.message
            : "An unexpected error occurred. Please try again.",
        );
        return;
      }

      // Store access token via the existing auth callback pattern
      // The SDK stores tokens in module memory; we use a redirect with the token
      // so the auth client can pick it up via claimSocialSession / direct store.
      // For now, redirect directly — the user will be asked to log in once.
      router.replace("/t/sentry/dashboard");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--color-bg-base)" }}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] pointer-events-none"
        style={{ background: "rgba(42,191,108,0.06)" }}
      />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--color-accent-soft)" }}
          >
            <ShieldCheck
              className="w-5 h-5"
              style={{ color: "var(--color-accent)" }}
              strokeWidth={1.75}
            />
          </div>
          <span
            className="text-lg font-display font-extrabold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            Scrolloop <span style={{ color: "var(--color-accent)" }}>Sentry</span>
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 lg:p-10 shadow-sm"
          style={{
            background: "var(--color-surface-2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.5)",
          }}
        >
          {/* Heading */}
          <div className="space-y-1 mb-8">
            <h1
              className="text-2xl font-display font-light leading-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              Welcome to Scrolloop Sentry
            </h1>
            <p
              className="text-sm font-body"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Set up your super admin account to get started
            </p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            {/* Setup Token */}
            <div className="space-y-1.5">
              <label
                htmlFor="setupToken"
                className="text-xs font-display font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Setup Token
              </label>
              <input
                id="setupToken"
                name="setupToken"
                type="text"
                required
                autoComplete="off"
                autoFocus
                disabled={isLoading}
                placeholder="Paste token from auth service logs"
                className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all"
                style={{
                  background: "var(--color-surface-3)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  color: "var(--color-text-primary)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-accent)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)")
                }
              />
              <p
                className="text-[11px] font-body leading-relaxed"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Find this in the auth service startup logs:{" "}
                <code
                  className="font-mono text-[10px] px-1 py-0.5 rounded"
                  style={{ background: "rgba(0,0,0,0.06)" }}
                >
                  docker logs auth-service | grep &quot;SETUP TOKEN&quot;
                </code>
              </p>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="text-xs font-display font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                disabled={isLoading}
                placeholder="Ada Lovelace"
                className="w-full rounded-xl px-4 py-3 text-sm font-body outline-none transition-all"
                style={{
                  background: "var(--color-surface-3)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  color: "var(--color-text-primary)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-accent)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)")
                }
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-display font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                disabled={isLoading}
                placeholder="admin@scrolloop.com"
                className="w-full rounded-xl px-4 py-3 text-sm font-body outline-none transition-all"
                style={{
                  background: "var(--color-surface-3)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  color: "var(--color-text-primary)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-accent)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)")
                }
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-display font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                  placeholder="Choose a strong password"
                  className="w-full rounded-xl px-4 py-3 pr-11 text-sm font-body outline-none transition-all"
                  style={{
                    background: "var(--color-surface-3)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    color: "var(--color-text-primary)",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "var(--color-accent)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)")
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-body"
                style={{
                  background: "rgba(192,57,43,0.07)",
                  color: "var(--color-danger)",
                  border: "1px solid rgba(192,57,43,0.15)",
                }}
              >
                <AlertCircle
                  className="h-4 w-4 mt-0.5 shrink-0"
                  strokeWidth={1.75}
                />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl py-3 text-sm font-display font-semibold tracking-wide transition-all flex items-center justify-center gap-2"
              style={{
                background: isLoading
                  ? "var(--color-accent-soft)"
                  : "var(--color-accent)",
                color: isLoading ? "var(--color-accent-dark)" : "white",
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  Creating account...
                </>
              ) : (
                "Create Super Admin Account"
              )}
            </button>
          </form>
        </div>

        <p
          className="mt-6 text-center text-[11px] font-display font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Scrolloop Sentry &middot; First Run Setup
        </p>
      </div>
    </div>
  );
}
