"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Key, Smartphone, Trash2, Plus, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@repo/ui";
import { startRegistration } from "@simplewebauthn/browser";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { useMfaStatus, useListPasskeys, useDeletePasskey } from "@/lib/queries";
import { useAuth } from "@fortknox/sdk";
import type { PasskeyCredential } from "@/lib/types";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { data: mfaData, isLoading: mfaLoading } = useMfaStatus();
  const { data: passkeys = [], isLoading: passkeysLoading, refetch: refetchPasskeys } = useListPasskeys();
  const deletePasskey = useDeletePasskey();
  const { client } = useAuth();

  const [addingPasskey, setAddingPasskey] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<RegistrationResponseJSON | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const flash = (msg: string, isError = false) => {
    if (isError) setError(msg);
    else setSuccessMsg(msg);
    setTimeout(() => { setSuccessMsg(null); setError(null); }, 3000);
  };

  const handleStartAddPasskey = async () => {
    try {
      setAddingPasskey(true);
      setError(null);
      const options = await client.startPasskeyRegistration();
      const registrationResponse = await startRegistration({ optionsJSON: options });
      setPendingRegistration(registrationResponse);
      setDeviceName("");
      setShowNameModal(true);
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        flash(err?.message || "Failed to start passkey registration", true);
      }
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleFinishAddPasskey = async () => {
    if (!pendingRegistration) return;
    try {
      setAddingPasskey(true);
      await client.finishPasskeyRegistration(
        pendingRegistration,
        deviceName.trim() || undefined,
      );
      setShowNameModal(false);
      setPendingRegistration(null);
      setDeviceName("");
      flash("Passkey added successfully");
      refetchPasskeys();
    } catch (err: any) {
      flash(err?.message || "Failed to save passkey", true);
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    try {
      setDeletingId(credentialId);
      await deletePasskey.mutateAsync(credentialId);
      flash("Passkey removed");
    } catch (err: any) {
      flash(err?.message || "Failed to delete passkey", true);
    } finally {
      setDeletingId(null);
    }
  };

  const handleManageTotp = () => router.push("/u/mfa/setup");

  // useMfaStatus queryFn already unwraps res.data.data, so mfaData is MfaStatus directly
  const totpEnabled = mfaData?.methods?.includes("totp") ?? false;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

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
                      {pk.deviceName || "Passkey"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(pk.createdAt)}
                      {pk.lastUsedAt ? ` · Last used ${formatDate(pk.lastUsedAt)}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePasskey(pk.id)}
                  disabled={deletingId === pk.id}
                  className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  aria-label={`Delete passkey ${pk.deviceName || pk.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
          onClick={handleStartAddPasskey}
          disabled={addingPasskey}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {addingPasskey ? "Registering..." : "Add a passkey"}
        </Button>
      </section>

      {/* Device Name Modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl space-y-4 mx-4">
            <h3 className="font-semibold text-foreground">Name your passkey</h3>
            <p className="text-sm text-muted-foreground">
              Give this passkey a name so you can identify it later (e.g. &quot;iPhone Face ID&quot;).
            </p>
            <input
              type="text"
              placeholder="e.g. iPhone Face ID (optional)"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFinishAddPasskey()}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNameModal(false);
                  setPendingRegistration(null);
                  setDeviceName("");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleFinishAddPasskey} disabled={addingPasskey}>
                {addingPasskey ? "Saving..." : "Save passkey"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
