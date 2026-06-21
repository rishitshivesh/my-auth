"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SentryButton,
  GlassCard,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui";
import {
  AlertCircle,
  RefreshCw,
  Smartphone,
  Mail,
  Key,
  Lock,
  Copy,
  Check,
  Download,
  Trash2,
  Plus,
  Fingerprint,
  Calendar,
} from "lucide-react";
import { useAuth } from "@scrolloop/sdk";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSetupTotp,
  useVerifyTotp,
  useDisableTotp,
  useRegenerateBackupCodes,
  useListPasskeys,
  useDeletePasskey,
} from "@/lib/queries";
import {
  listTotpDevices,
  deleteTotpDevice,
  clearTotpDevices,
  type TotpDevice,
} from "@/lib/mfa-device-store";
import { MfaWizard } from "../mfa/mfa-wizard";
import { PasskeyRegisterModal } from "../auth/passkey-register-modal";

export interface MFAMethod {
  id: string;
  name: string;
  type: "totp" | "email-otp" | "backup-codes" | "passkey";
  enabled: boolean;
  verified: boolean;
  lastUpdated?: string;
}

interface MFASettingsProps {
  methods: MFAMethod[];
  primaryColor?: string;
}

export function MFASettings({ methods, primaryColor = "#2ABF6C" }: MFASettingsProps) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  // Setup/Wizards modal states
  const [mfaWizardOpen, setMfaWizardOpen] = useState(false);
  const [passkeyModalOpen, setPasskeyModalOpen] = useState(false);

  // Backup codes download state
  const [mfaEnabledBackupCodes, setMfaEnabledBackupCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Disable Confirmation State
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const [methodToRemove, setMethodToRemove] = useState<string | null>(null);

  // Devices state
  const [totpDevices, setTotpDevices] = useState<TotpDevice[]>([]);

  // Mutations
  const disableTotp = useDisableTotp();
  const regenerateBackupCodes = useRegenerateBackupCodes();
  const { data: passkeys = [], refetch: refetchPasskeys } = useListPasskeys();
  const deletePasskeyMutation = useDeletePasskey();

  // Load TOTP devices list from localStorage
  useEffect(() => {
    if (user) {
      setTotpDevices(listTotpDevices(user.id));
    }
  }, [user, mfaWizardOpen]);

  const getIcon = (type: string) => {
    const iconClass = "h-5 w-5";
    switch (type) {
      case "totp":
        return <Smartphone className={iconClass} />;
      case "email-otp":
        return <Mail className={iconClass} />;
      case "backup-codes":
        return <Key className={iconClass} />;
      case "passkey":
        return <Lock className={iconClass} />;
      default:
        return null;
    }
  };

  const handleSetupMethod = (methodId: string) => {
    setSelectedMethod(methodId);
    setMfaEnabledBackupCodes(null);
    if (methodId === "totp") {
      setMfaWizardOpen(true);
    } else if (methodId === "passkey") {
      setPasskeyModalOpen(true);
    } else if (methodId === "backup-codes") {
      handleRegenerateCodes();
    } else {
      setSetupOpen(true);
    }
  };

  const handleRegenerateCodes = async () => {
    try {
      const res = await regenerateBackupCodes.mutateAsync();
      setMfaEnabledBackupCodes(res.backupCodes);
      setSelectedMethod("backup-codes");
      setSetupOpen(true);
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const handleRemoveClick = (methodId: string) => {
    setMethodToRemove(methodId);
    setIsConfirmRemoveOpen(true);
  };

  const handleConfirmRemove = async () => {
    if (!methodToRemove) return;
    try {
      if (methodToRemove === "totp") {
        await disableTotp.mutateAsync();
        if (user) {
          clearTotpDevices(user.id);
          setTotpDevices([]);
        }
      }
      setIsConfirmRemoveOpen(false);
      setMethodToRemove(null);
    } catch (err: unknown) {
      // Handled by withErrorHandler
    }
  };

  const handleDeleteTotpDevice = async (deviceId: string) => {
    if (!user) return;
    deleteTotpDevice(user.id, deviceId);
    const remaining = listTotpDevices(user.id);
    setTotpDevices(remaining);

    // If no devices left, disable TOTP on the backend!
    if (remaining.length === 0) {
      try {
        await disableTotp.mutateAsync();
      } catch (err) {
        // Handled
      }
    } else {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    try {
      await deletePasskeyMutation.mutateAsync(credentialId);
      refetchPasskeys();
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
    } catch (err) {
      // Handled
    }
  };

  const copyCodesToClipboard = () => {
    if (!mfaEnabledBackupCodes) return;
    navigator.clipboard.writeText(mfaEnabledBackupCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const downloadBackupCodes = () => {
    if (!mfaEnabledBackupCodes) return;
    const element = document.createElement("a");
    const file = new Blob([mfaEnabledBackupCodes.join("\n")], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "sentry-backup-codes.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const dialogStyle = {
    background: "rgba(255, 255, 255, 0.88)",
    backdropFilter: "blur(32px)",
    WebkitBackdropFilter: "blur(32px)",
    borderColor: "rgba(255, 255, 255, 0.65)",
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {methods.map((method, index) => (
          <motion.div
            key={method.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <GlassCard tier={1} className="p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between w-full">
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-2.5 rounded-xl bg-neutral-100 text-neutral-600 border border-neutral-200/50">
                    {getIcon(method.type)}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2.5">
                      <p className="text-sm font-display font-semibold text-neutral-900">{method.name}</p>
                      {method.verified && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-display font-bold uppercase tracking-wider bg-emerald-100 border-transparent text-emerald-800 px-2 py-0.5"
                        >
                          Active
                        </Badge>
                      )}
                    </div>
                    {method.type === "totp" && (
                      <p className="text-xs font-body text-neutral-500">
                        Use an authenticator app (like Google Authenticator or Authy) to generate verification codes.
                      </p>
                    )}
                    {method.type === "passkey" && (
                      <p className="text-xs font-body text-neutral-500">
                        Use biometrics (Touch ID / Face ID) or hardware security keys to sign in securely.
                      </p>
                    )}
                    {method.type === "email-otp" && (
                      <p className="text-xs font-body text-neutral-500">
                        Receive a temporary verification code in your email.
                      </p>
                    )}
                    {method.type === "backup-codes" && method.enabled && (
                      <p className="text-xs font-body text-neutral-500">
                        Keep backup codes secure in case you lose access to your device.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {method.verified ? (
                    <div className="flex gap-2">
                      {method.type === "backup-codes" && (
                        <SentryButton
                          size="sm"
                          variant="ghost"
                          onClick={handleRegenerateCodes}
                          className="text-xs h-8 px-3 gap-1.5 font-display border border-border/40 hover:bg-neutral-100"
                          isLoading={regenerateBackupCodes.isPending}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </SentryButton>
                      )}
                      {method.type === "totp" && (
                        <div className="flex gap-2">
                          <SentryButton
                            size="sm"
                            variant="outline"
                            onClick={() => setMfaWizardOpen(true)}
                            className="text-xs h-8 px-3 gap-1.5 font-display hover:bg-neutral-50"
                          >
                            <Plus className="h-3 w-3" />
                            Add device
                          </SentryButton>
                          <SentryButton
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveClick(method.id)}
                            className="text-xs h-8 px-3 text-destructive border border-destructive/20 hover:bg-destructive/5 font-display"
                          >
                            Disable All
                          </SentryButton>
                        </div>
                      )}
                      {method.type === "passkey" && (
                        <SentryButton
                          size="sm"
                          variant="outline"
                          onClick={() => setPasskeyModalOpen(true)}
                          className="text-xs h-8 px-3 gap-1.5 font-display hover:bg-neutral-50"
                        >
                          <Plus className="h-3 w-3" />
                          Add passkey
                        </SentryButton>
                      )}
                    </div>
                  ) : (
                    method.type !== "backup-codes" && (
                      <SentryButton
                        size="sm"
                        variant="accent"
                        className="h-8 px-4 font-display text-xs"
                        onClick={() => handleSetupMethod(method.id)}
                      >
                        Set up
                      </SentryButton>
                    )
                  )}
                </div>
              </div>

              {/* Multiple TOTP Devices list */}
              {method.type === "totp" && method.verified && totpDevices.length > 0 && (
                <div className="mt-2 border-t border-border/40 pt-3 space-y-2">
                  <p className="text-[10px] font-display font-bold uppercase tracking-wider text-neutral-400">
                    Registered Authenticator Devices ({totpDevices.length})
                  </p>
                  <div className="divide-y divide-neutral-100">
                    {totpDevices.map((device) => (
                      <div key={device.id} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-neutral-400" />
                          <span className="font-body font-medium text-neutral-800">{device.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-neutral-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(device.createdAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => handleDeleteTotpDevice(device.id)}
                            className="text-destructive hover:underline flex items-center gap-1 font-medium transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Passkeys list */}
              {method.type === "passkey" && (method.verified || passkeys.length > 0) && (
                <div className="mt-2 border-t border-border/40 pt-3 space-y-2">
                  <p className="text-[10px] font-display font-bold uppercase tracking-wider text-neutral-400">
                    Registered Passkeys & Credentials ({passkeys.length})
                  </p>
                  {passkeys.length > 0 ? (
                    <div className="divide-y divide-neutral-100">
                      {passkeys.map((pk) => (
                        <div key={pk.id} className="flex items-center justify-between py-2.5 text-sm">
                          <div className="flex items-center gap-2">
                            <Fingerprint className="h-4 w-4 text-neutral-400" />
                            <span className="font-body font-medium text-neutral-800">
                              {pk.deviceName || "Security Key / Biometrics"}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-neutral-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(pk.createdAt).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => handleDeletePasskey(pk.id)}
                              className="text-destructive hover:underline flex items-center gap-1 font-medium transition-colors"
                              disabled={deletePasskeyMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-body text-neutral-400 italic">No passkeys registered yet.</p>
                  )}
                </div>
              )}
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* SETUP DIALOG FOR BACKUP CODES */}
      <Dialog
        open={setupOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSetupOpen(false);
            setMfaEnabledBackupCodes(null);
          }
        }}
      >
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          {mfaEnabledBackupCodes && (
            <div className="space-y-6 py-2">
              <DialogHeader>
                <DialogTitle className="font-display font-semibold text-lg">Save Backup Codes</DialogTitle>
                <DialogDescription className="font-body text-sm text-neutral-600">
                  Store these codes in a safe, offline location. Each code can only be used once.
                </DialogDescription>
              </DialogHeader>

              <div className="p-4 rounded-sm border border-border bg-black/5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 font-mono text-sm text-neutral-800 justify-items-center">
                  {mfaEnabledBackupCodes.map((code, i) => (
                    <div key={i} className="tracking-wider">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <SentryButton
                  type="button"
                  variant="ghost"
                  className="flex-1 gap-2 text-xs border border-border/40"
                  onClick={copyCodesToClipboard}
                >
                  {copiedCodes ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedCodes ? "Copied" : "Copy Codes"}
                </SentryButton>
                <SentryButton
                  type="button"
                  variant="ghost"
                  className="flex-1 gap-2 text-xs border border-border/40"
                  onClick={downloadBackupCodes}
                >
                  <Download className="h-4 w-4" />
                  Download TXT
                </SentryButton>
              </div>

              <DialogFooter className="pt-4 border-t border-border/50">
                <SentryButton
                  className="w-full sm:w-auto"
                  variant="primary"
                  onClick={() => {
                    setSetupOpen(false);
                    setMfaEnabledBackupCodes(null);
                  }}
                >
                  I've saved my codes
                </SentryButton>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DISABLE MFA CONFIRMATION DIALOG */}
      <Dialog open={isConfirmRemoveOpen} onOpenChange={setIsConfirmRemoveOpen}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Disable Authenticator App?
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              This will disable two-factor authentication on your account. Your account security will be lowered.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4 border-t border-border/50 gap-2">
            <SentryButton type="button" variant="ghost" onClick={() => setIsConfirmRemoveOpen(false)}>
              Cancel
            </SentryButton>
            <SentryButton
              type="button"
              variant="destructive"
              onClick={handleConfirmRemove}
              isLoading={disableTotp.isPending}
            >
              Confirm Disable
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* STEPWISE MFA SETUP WIZARD DIALOG */}
      <MfaWizard open={mfaWizardOpen} onClose={() => setMfaWizardOpen(false)} />

      {/* PASSKEY SETUP WIZARD DIALOG */}
      <PasskeyRegisterModal
        open={passkeyModalOpen}
        onOpenChange={setPasskeyModalOpen}
        onSuccess={() => {
          refetchPasskeys();
          qc.invalidateQueries({ queryKey: ["mfa", "status"] });
        }}
      />
    </div>
  );
}
