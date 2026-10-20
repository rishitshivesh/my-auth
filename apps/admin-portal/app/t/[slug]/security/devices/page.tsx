"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PortalLayout } from "@/components/layouts/portal-layout";
import {
  SentryButton,
  GlassCard,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  SentryInput,
  StatusBadge,
} from "@repo/ui";
import {
  Smartphone,
  Fingerprint,
  Mail,
  Trash2,
  Edit2,
  Plus,
  Calendar,
  Clock,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@scrolloop/sdk";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMfaStatus,
  useListPasskeys,
  useDeletePasskey,
  useDisableTotp,
  useRequestEmailOtp,
  useVerifyEmailOtp,
  useDisableAllMfa,
} from "@/lib/queries";
import {
  listTotpDevices,
  deleteTotpDevice,
  renameTotpDevice,
  getPasskeyName,
  setPasskeyName,
  type TotpDevice,
} from "@/lib/mfa-device-store";
import { MfaWizard } from "@/components/mfa/mfa-wizard";
import { PasskeyRegisterModal } from "@/components/auth/passkey-register-modal";
import { formatRelativeTime } from "@/lib/utils";
import { getErrorMessage } from "@/lib/api-error";

export default function MfaDevicesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user } = useAuth();
  const qc = useQueryClient();

  // Wizard & Dialog Open States
  const [totpWizardOpen, setTotpWizardOpen] = useState(false);
  const [passkeyModalOpen, setPasskeyModalOpen] = useState(false);
  const [emailOtpOpen, setEmailOtpOpen] = useState(false);

  // Email OTP state
  const [emailStep, setEmailStep] = useState<"request" | "verify">("request");
  const [emailCode, setEmailCode] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // Renaming State
  const [renamingDevice, setRenamingDevice] = useState<{
    type: "totp" | "passkey";
    id: string;
    currentName: string;
  } | null>(null);
  const [newName, setNewName] = useState("");

  // Deletion States
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "totp" | "passkey" | "email";
    id?: string;
    label: string;
  } | null>(null);

  // Loaded TOTP devices
  const [totpDevices, setTotpDevices] = useState<TotpDevice[]>([]);

  // API hooks
  const { data: mfaStatus, isLoading: mfaLoading, refetch: refetchMfa } = useMfaStatus();
  const { data: passkeys = [], isLoading: passkeysLoading, refetch: refetchPasskeys } = useListPasskeys();

  const deletePasskeyMutation = useDeletePasskey();
  const disableTotpMutation = useDisableTotp();
  const requestEmailOtpMutation = useRequestEmailOtp();
  const verifyEmailOtpMutation = useVerifyEmailOtp();
  const disableAllMfaMutation = useDisableAllMfa();

  // Load TOTP devices on mount/reload
  useEffect(() => {
    if (user) {
      setTotpDevices(listTotpDevices(user.id));
    }
  }, [user, totpWizardOpen]);

  const handleRenameClick = (type: "totp" | "passkey", id: string, name: string) => {
    setRenamingDevice({ type, id, currentName: name });
    setNewName(name);
  };

  const handleSaveRename = () => {
    if (!user || !renamingDevice || !newName.trim()) return;

    if (renamingDevice.type === "totp") {
      renameTotpDevice(user.id, renamingDevice.id, newName.trim());
      setTotpDevices(listTotpDevices(user.id));
    } else {
      setPasskeyName(renamingDevice.id, newName.trim());
      refetchPasskeys();
    }
    setRenamingDevice(null);
    setNewName("");
  };

  const handleDeleteClick = (type: "totp" | "passkey" | "email", id?: string, label?: string) => {
    setDeleteTarget({ type, id, label: label || "" });
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !user) return;

    try {
      if (deleteTarget.type === "totp" && deleteTarget.id) {
        deleteTotpDevice(user.id, deleteTarget.id);
        const remaining = listTotpDevices(user.id);
        setTotpDevices(remaining);

        // If no TOTP devices left, disable TOTP on the backend!
        if (remaining.length === 0) {
          await disableTotpMutation.mutateAsync();
        } else {
          qc.invalidateQueries({ queryKey: ["mfa", "status"] });
        }
      } else if (deleteTarget.type === "passkey" && deleteTarget.id) {
        await deletePasskeyMutation.mutateAsync(deleteTarget.id);
        refetchPasskeys();
      } else if (deleteTarget.type === "email") {
        // Disabling Email OTP (since there's no single method endpoint, use disableAllMfa)
        await disableAllMfaMutation.mutateAsync();
      }
      setIsConfirmDeleteOpen(false);
      setDeleteTarget(null);
    } catch {
      // Error handled by withErrorHandler HOF
    }
  };

  const handleSetupEmailOtp = async () => {
    setEmailStep("request");
    setEmailCode("");
    setEmailError(null);
    setEmailOtpOpen(true);
  };

  const handleRequestEmailOtp = async () => {
    setEmailError(null);
    try {
      await requestEmailOtpMutation.mutateAsync();
      setEmailStep("verify");
    } catch (err: unknown) {
      setEmailError(getErrorMessage(err, "Failed to send code"));
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailCode || emailCode.length !== 6) {
      setEmailError("Verification code must be 6 digits");
      return;
    }
    setEmailError(null);
    try {
      await verifyEmailOtpMutation.mutateAsync(emailCode);
      setEmailOtpOpen(false);
      setEmailCode("");
    } catch (err: unknown) {
      setEmailError(getErrorMessage(err, "Verification failed"));
    }
  };

  const isEmailOtpActive =
    mfaStatus?.methods.includes("email") ||
    mfaStatus?.methods.includes("email_otp") ||
    mfaStatus?.methods.includes("email-otp");

  const dialogStyle = {
    background: "rgba(255, 255, 255, 0.88)",
    backdropFilter: "blur(32px)",
    WebkitBackdropFilter: "blur(32px)",
    borderColor: "rgba(255, 255, 255, 0.65)",
  };

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="MFA Devices"
      pageSubtitle="Manage your multi-factor authentication devices, passkeys, and email security codes"
      currentPath={`/t/${slug}/security/devices`}
    >
      <div className="space-y-8 max-w-4xl">
        {/* Section 1: Authenticator Apps */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-display font-semibold text-neutral-900">Authenticator Apps</h3>
              <p className="text-xs font-body text-neutral-500">
                Generate secure, time-based codes (TOTP) using apps like Google Authenticator or 1Password.
              </p>
            </div>
            <SentryButton
              size="sm"
              variant="outline"
              onClick={() => setTotpWizardOpen(true)}
              className="gap-1.5 h-9 font-display hover:bg-neutral-50"
            >
              <Plus className="h-4 w-4" />
              Add device
            </SentryButton>
          </div>

          <GlassCard tier={1} className="p-6">
            {mfaLoading ? (
              <div className="space-y-3">
                <div className="h-12 rounded-sm bg-black/5 animate-pulse" />
              </div>
            ) : totpDevices.length === 0 ? (
              <div className="text-center py-8">
                <Smartphone className="h-8 w-8 mx-auto text-neutral-300 mb-3" />
                <p className="text-sm font-display font-medium text-neutral-500">No authenticator apps linked</p>
                <p className="text-xs font-body text-neutral-400 mt-1">
                  Secure your account by linking an authenticator app.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {totpDevices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-100 rounded-lg text-neutral-600 border border-neutral-200/50">
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-display font-semibold text-neutral-800">{device.name}</span>
                          <StatusBadge status="active" className="px-1.5 py-0.5 text-[9px] font-display uppercase">
                            Linked
                          </StatusBadge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-body">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Added {new Date(device.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRenameClick("totp", device.id, device.name)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors rounded-sm hover:bg-neutral-100"
                        title="Rename device"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick("totp", device.id, device.name)}
                        className="p-1.5 text-neutral-400 hover:text-destructive transition-colors rounded-sm hover:bg-destructive/5"
                        title="Remove device"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Section 2: Passkeys & Security Keys */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-display font-semibold text-neutral-900">Passkeys & Security Keys</h3>
              <p className="text-xs font-body text-neutral-500">
                Log in securely using Touch ID, Face ID, Windows Hello, or physical security keys.
              </p>
            </div>
            <SentryButton
              size="sm"
              variant="outline"
              onClick={() => setPasskeyModalOpen(true)}
              className="gap-1.5 h-9 font-display hover:bg-neutral-50"
            >
              <Plus className="h-4 w-4" />
              Add passkey
            </SentryButton>
          </div>

          <GlassCard tier={1} className="p-6">
            {passkeysLoading ? (
              <div className="space-y-3">
                <div className="h-12 rounded-sm bg-black/5 animate-pulse" />
              </div>
            ) : passkeys.length === 0 ? (
              <div className="text-center py-8">
                <Fingerprint className="h-8 w-8 mx-auto text-neutral-300 mb-3" />
                <p className="text-sm font-display font-medium text-neutral-500">No passkeys registered</p>
                <p className="text-xs font-body text-neutral-400 mt-1">
                  Add a passkey to bypass passwords and sign in securely.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {passkeys.map((pk) => {
                  const cosmeticName = getPasskeyName(pk.id, pk.deviceName || "Security Key");
                  return (
                    <div key={pk.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-neutral-100 rounded-lg text-neutral-600 border border-neutral-200/50">
                          <Fingerprint className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-display font-semibold text-neutral-800">{cosmeticName}</span>
                            <StatusBadge status="active" className="px-1.5 py-0.5 text-[9px] font-display uppercase">
                              Passkey
                            </StatusBadge>
                            {pk.transports && pk.transports.length > 0 && (
                              <div className="flex gap-1">
                                {pk.transports.map((t) => (
                                  <span key={t} className="px-1.5 py-0.2 text-[8px] uppercase tracking-wider font-semibold font-mono rounded bg-black/5 text-neutral-500 border border-black/10">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-x-4 flex-wrap text-xs text-neutral-400 font-body">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>Added {new Date(pk.createdAt).toLocaleDateString()}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Last used: {pk.lastUsedAt ? formatRelativeTime(pk.lastUsedAt) : "Never used"}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRenameClick("passkey", pk.id, cosmeticName)}
                          className="p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors rounded-sm hover:bg-neutral-100"
                          title="Rename passkey"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick("passkey", pk.id, cosmeticName)}
                          className="p-1.5 text-neutral-400 hover:text-destructive transition-colors rounded-sm hover:bg-destructive/5"
                          title="Remove passkey"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Section 3: Email OTP Codes */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-display font-semibold text-neutral-900">Email OTP Codes</h3>
            <p className="text-xs font-body text-neutral-500">
              Receive a one-time verification code via email as a fallback factor.
            </p>
          </div>

          <GlassCard tier={1} className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-neutral-100 rounded-lg text-neutral-600 border border-neutral-200/50">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-display font-semibold text-neutral-800">Email OTP Verification</span>
                    <StatusBadge status={isEmailOtpActive ? "active" : "system"} className="px-1.5 py-0.5 text-[9px] font-display uppercase">
                      {isEmailOtpActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-neutral-500 font-body">
                    Verification codes will be sent to: <span className="font-semibold text-neutral-700">{user?.email}</span>
                  </p>
                </div>
              </div>

              <div>
                {isEmailOtpActive ? (
                  <SentryButton
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteClick("email", undefined, "Email OTP")}
                    className="text-xs text-destructive border border-destructive/20 hover:bg-destructive/5 font-display h-9 px-4"
                  >
                    Disable
                  </SentryButton>
                ) : (
                  <SentryButton
                    size="sm"
                    variant="accent"
                    onClick={handleSetupEmailOtp}
                    className="text-xs font-display h-9 px-4"
                  >
                    Set up
                  </SentryButton>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* RENAME DIALOG */}
      <Dialog open={renamingDevice !== null} onOpenChange={(open) => { if (!open) setRenamingDevice(null); }}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg">
              Rename {renamingDevice?.type === "totp" ? "Authenticator Device" : "Passkey"}
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-500">
              Provide a clear label to identify this authentication device.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2">
            <label className="text-xs font-display font-bold uppercase tracking-wider text-neutral-400">Device Name</label>
            <SentryInput
              placeholder="e.g. Work Laptop, My Phone"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter className="pt-4 border-t border-border/50 gap-2">
            <SentryButton type="button" variant="ghost" onClick={() => setRenamingDevice(null)}>
              Cancel
            </SentryButton>
            <SentryButton type="button" variant="primary" onClick={handleSaveRename} disabled={!newName.trim()}>
              Save Label
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETION CONFIRMATION DIALOG */}
      <Dialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg text-destructive flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Remove {deleteTarget?.label || "Authentication Device"}?
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              {deleteTarget?.type === "email" ? (
                "Disabling Email OTP will turn off all other multi-factor authentication methods. Are you sure you want to lower your security settings?"
              ) : (
                <>
                  Are you sure you want to delete this {deleteTarget?.type === "totp" ? "authenticator device" : "passkey"}?
                  {deleteTarget?.type === "totp" && totpDevices.length === 1 && (
                    <strong className="block mt-2 text-destructive">
                      Warning: This is your last authenticator device. Removing it will turn off TOTP multi-factor authentication.
                    </strong>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4 border-t border-border/50 gap-2">
            <SentryButton type="button" variant="ghost" onClick={() => setIsConfirmDeleteOpen(false)}>
              Cancel
            </SentryButton>
            <SentryButton
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              isLoading={
                deletePasskeyMutation.isPending ||
                disableTotpMutation.isPending ||
                disableAllMfaMutation.isPending
              }
            >
              Confirm Removal
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EMAIL OTP SETUP DIALOG */}
      <Dialog open={emailOtpOpen} onOpenChange={setEmailOtpOpen}>
        <DialogContent className="text-neutral-900 border max-w-sm" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-accent" />
              Set up Email OTP
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-500">
              {emailStep === "request"
                ? `Send a verification code to ${user?.email} to enable email-based OTP.`
                : `A 6-digit verification code has been sent to ${user?.email}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {emailStep === "request" ? (
              <p className="text-xs font-body text-neutral-500 leading-relaxed">
                Click the button below to receive a secure code. Enter this code on the next step to enroll.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-display font-bold uppercase tracking-wider text-neutral-400">Verification Code</label>
                <SentryInput
                  placeholder="Enter 6-digit code"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
                  maxLength={6}
                  autoFocus
                />
              </div>
            )}

            {emailError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 p-2.5 rounded border border-destructive/15">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{emailError}</span>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border/50 gap-2">
            <SentryButton type="button" variant="ghost" onClick={() => setEmailOtpOpen(false)}>
              Cancel
            </SentryButton>
            {emailStep === "request" ? (
              <SentryButton
                type="button"
                variant="primary"
                onClick={handleRequestEmailOtp}
                isLoading={requestEmailOtpMutation.isPending}
              >
                Send Verification Code
              </SentryButton>
            ) : (
              <SentryButton
                type="button"
                variant="primary"
                onClick={handleVerifyEmailOtp}
                isLoading={verifyEmailOtpMutation.isPending}
                disabled={emailCode.length !== 6}
              >
                Verify and Enable
              </SentryButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TOTP Setup wizard */}
      <MfaWizard open={totpWizardOpen} onClose={() => setTotpWizardOpen(false)} />

      {/* Passkey Setup dialog */}
      <PasskeyRegisterModal
        open={passkeyModalOpen}
        onOpenChange={setPasskeyModalOpen}
        onSuccess={() => {
          refetchPasskeys();
          qc.invalidateQueries({ queryKey: ["mfa", "status"] });
        }}
      />
    </PortalLayout>
  );
}
