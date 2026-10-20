"use client"

import { useState } from "react"
import { SentryButton, SentrySkeleton } from "@repo/ui"

import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { useMfaStatus, useSetupTotp, useVerifyTotp, useDisableTotp } from "@/lib/queries"
import type { TotpSetupData } from "@/lib/types"
import { ShieldCheck, ShieldOff, QrCode, Key } from "lucide-react"
import { getErrorMessage } from "@/lib/api-error";

export default function SecurityPage() {
  const { data: mfaStatus, isLoading } = useMfaStatus()
  const setupTotp = useSetupTotp()
  const verifyTotp = useVerifyTotp()
  const disableTotp = useDisableTotp()

  const [stage, setStage] = useState<"status" | "setup" | "verify" | "done">("status")
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null)
  const [verifyCode, setVerifyCode] = useState("")

  const handleStartSetup = async () => {
    const data = await setupTotp.mutateAsync()
    setSetupData(data)
    setStage("setup")
  }

  const handleVerify = async () => {
    await verifyTotp.mutateAsync(verifyCode)
    setStage("done")
  }

  const handleDisable = async () => {
    if (!confirm("Are you sure you want to disable MFA? Your account will be less secure.")) return
    await disableTotp.mutateAsync()
    setStage("status")
    setSetupData(null)
    setVerifyCode("")
  }

  const error =
    [setupTotp.error, verifyTotp.error, disableTotp.error]
      .filter((e): e is Error => e instanceof Error)
      .map((e) => getErrorMessage(e))[0] ?? null

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Security</h1>
            <p className="text-xs text-muted-foreground">Manage your account security settings</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl space-y-6">
            {isLoading ? (
              <SentrySkeleton className="h-48 w-full rounded-xl" />
            ) : (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {mfaStatus?.enabled ? (
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ShieldOff className="h-5 w-5 text-amber-500" />
                    )}
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Multi-Factor Authentication
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {mfaStatus?.enabled
                          ? `Active via: ${mfaStatus.methods.join(", ")}`
                          : "Not configured — your account is less secure"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      mfaStatus?.enabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    }`}
                  >
                    {mfaStatus?.enabled ? "Active" : "Not configured"}
                  </span>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                {/* Stage: not enabled */}
                {stage === "status" && !mfaStatus?.enabled && (
                  <SentryButton
                    onClick={handleStartSetup}
                    disabled={setupTotp.isPending}
                    className="w-full"
                  >
                    <QrCode className="h-4 w-4 mr-2" />
                    {setupTotp.isPending ? "Preparing..." : "Set up Authenticator App"}
                  </SentryButton>
                )}

                {/* Stage: enabled */}
                {stage === "status" && mfaStatus?.enabled && (
                  <div className="flex gap-3">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">
                      <Key className="h-4 w-4" />
                      {mfaStatus.backupCodesRemaining} backup codes remaining
                    </div>
                    <SentryButton
                      variant="destructive"
                      onClick={handleDisable}
                      disabled={disableTotp.isPending}
                    >
                      {disableTotp.isPending ? "Disabling..." : "Disable"}
                    </SentryButton>
                  </div>
                )}

                {/* Stage: show QR */}
                {stage === "setup" && setupData && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy,
                      1Password, etc.)
                    </p>
                    <div className="flex justify-center">
                      <img
                        src={setupData.qrCode}
                        alt="TOTP QR Code"
                        className="h-48 w-48 rounded-lg border border-border"
                      />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Can't scan? Enter this key manually:{" "}
                      <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">
                        {setupData.secret}
                      </code>
                    </p>
                    <SentryButton onClick={() => setStage("verify")} className="w-full">
                      I've scanned the code →
                    </SentryButton>
                  </div>
                )}

                {/* Stage: verify */}
                {stage === "verify" && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Enter the 6-digit code from your authenticator app to confirm setup.
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={verifyCode}
                      onChange={(e) =>
                        setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    <SentryButton
                      onClick={handleVerify}
                      disabled={verifyCode.length !== 6 || verifyTotp.isPending}
                      className="w-full"
                    >
                      {verifyTotp.isPending ? "Verifying..." : "Verify & Enable MFA"}
                    </SentryButton>
                  </div>
                )}

                {/* Stage: done */}
                {stage === "done" && (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 space-y-2">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      MFA enabled successfully!
                    </p>
                    {setupData?.backupCodes && setupData.backupCodes.length > 0 && (
                      <>
                        <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                          Save these backup codes in a safe place. Each can only be used once.
                        </p>
                        <div className="grid grid-cols-2 gap-1 font-mono text-xs bg-white dark:bg-black/20 rounded border p-3">
                          {setupData.backupCodes.map((code) => (
                            <span key={code} className="text-muted-foreground">
                              {code}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
