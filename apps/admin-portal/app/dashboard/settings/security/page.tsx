"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Key, Smartphone, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@repo/ui";
import { useMfaStatus, useListPasskeys, useDeletePasskey } from "@/lib/queries";
import type { PasskeyCredential } from "@/lib/types";
import { PasskeyRegisterModal } from "@/components/auth/passkey-register-modal";

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    return formatDate(dateStr);
  } catch {
    return dateStr;
  }
}

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { data: mfaData, isLoading: mfaLoading } = useMfaStatus();
  const { data: passkeys = [], isLoading: passkeysLoading, refetch: refetchPasskeys } = useListPasskeys();
  const deletePasskeyMutation = useDeletePasskey();

  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const flash = (msg: string, isError = false) => {
    if (isError) setError(msg);
    else setSuccessMsg(msg);
    setTimeout(() => { setSuccessMsg(null); setError(null); }, 3000);
  };

  const handleDeletePasskey = async (credentialId: string) => {
    try {
      setDeletingId(credentialId);
      await deletePasskeyMutation.mutateAsync(credentialId);
      flash("Passkey removed");
    } catch (err: any) {
      flash(err?.message || "Failed to remove passkey", true);
    } finally {
      setDeletingId(null);
    }
  };

  const handleManageTotp = () => router.push("/u/mfa/setup");

  const totpEnabled = mfaData?.methods?.includes("totp") ?? false;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage two-factor authentication and passkeys
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* TOTP Section */}
      <section className="rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Authenticator App (TOTP)</h2>
            <p className="text-xs text-muted-foreground">
              Time-based one-time passwords via Google Authenticator, Authy, etc.
            </p>
          </div>
          {!mfaLoading && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                totpEnabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <CheckCircle className="h-3 w-3" />
              {totpEnabled ? "Enabled" : "Not enabled"}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {totpEnabled
              ? "Your account is protected with an authenticator app"
              : "Add extra protection to your account"}
          </p>
          <Button variant="outline" size="sm" onClick={handleManageTotp}>
            {totpEnabled ? "Manage" : "Enable"}
          </Button>
        </div>
      </section>

      {/* Passkeys Section */}
      <section className="rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Passkeys</h2>
            <p className="text-xs text-muted-foreground">
              Sign in with Face ID, Touch ID, or a security key — no password needed
            </p>
          </div>
        </div>

        {passkeysLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : passkeys.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {(passkeys as PasskeyCredential[]).map((pk) => (
              <li
                key={pk.id}
                className="flex items-center justify-between px-4 py-3 bg-background"
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {pk.deviceName ?? "Unknown device"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(pk.createdAt)}
                      {" · "}
                      {pk.lastUsedAt ? `Last used ${formatRelativeTime(pk.lastUsedAt)}` : "Never used"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeletePasskey(pk.id)}
                  disabled={deletingId === pk.id}
                  className="text-muted-foreground hover:text-destructive transition-colors text-xs"
                  aria-label={`Remove passkey ${pk.deviceName ?? pk.id}`}
                >
                  {deletingId === pk.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Remove"
                  )}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-1">
            No passkeys registered yet.
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPasskeyModal(true)}
          className="gap-2"
        >
          <Key className="h-4 w-4" />
          Add passkey
        </Button>
      </section>

      {/* TODO: Sessions section — FIX D: implement active sessions list via API */}

      <PasskeyRegisterModal
        open={showPasskeyModal}
        onOpenChange={setShowPasskeyModal}
        onSuccess={() => {
          refetchPasskeys();
          flash("Passkey added successfully");
        }}
      />
    </div>
  );
}
