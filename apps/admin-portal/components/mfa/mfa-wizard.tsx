'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@scrolloop/sdk';
import {
  Dialog,
  DialogContent,
} from '@repo/ui';
import {
  StepChooseApp,
  StepScanQr,
  StepVerifyCode,
  StepSaveBackup,
  StepComplete,
} from '@/components/mfa/mfa-wizard-steps';
import { useSetupTotp, useVerifyTotp } from '@/lib/queries';
import { addTotpDevice } from '@/lib/mfa-device-store';


// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'choose-app' | 'scan-qr' | 'verify-code' | 'save-backup' | 'complete';

interface TotpData {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

interface MfaWizardProps {
  open: boolean;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_ORDER: WizardStep[] = [
  'choose-app',
  'scan-qr',
  'verify-code',
  'save-backup',
  'complete',
];

const PROGRESS_STEPS = STEP_ORDER.filter((s) => s !== 'complete') as Exclude<WizardStep, 'complete'>[];

const STEP_LABELS: Record<Exclude<WizardStep, 'complete'>, string> = {
  'choose-app': 'Name Your Device',
  'scan-qr': 'Scan QR Code',
  'verify-code': 'Verify Code',
  'save-backup': 'Save Backup Codes',
};

// ─── Dialog style (glassmorphism) ─────────────────────────────────────────────

const dialogStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.88)',
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  borderColor: 'rgba(255, 255, 255, 0.65)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MfaWizard({ open, onClose }: MfaWizardProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<WizardStep>('choose-app');
  const [deviceName, setDeviceName] = useState('');
  const [totpData, setTotpData] = useState<TotpData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const setupTotp = useSetupTotp();
  const verifyTotp = useVerifyTotp();

  // ── Reset & close ──────────────────────────────────────────────────────────

  function handleClose() {
    setStep('choose-app');
    setDeviceName('');
    setTotpData(null);
    setBackupCodes([]);
    setVerifyError(null);
    onClose();
  }

  // ── Step handlers ──────────────────────────────────────────────────────────

  async function handleChooseAppNext() {
    try {
      const data = await setupTotp.mutateAsync();
      setTotpData(data);
      setStep('scan-qr');
    } catch {
      // Handled by withErrorHandler toast
    }
  }

  function handleScanQrNext() {
    setStep('verify-code');
  }

  async function handleVerify(code: string) {
    setVerifyError(null);
    try {
      const result = await verifyTotp.mutateAsync(code);
      setBackupCodes(result.backupCodes);
      if (user) {
        addTotpDevice(user.id, deviceName);
      }
      setStep('save-backup');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Verification failed. Please try again.';
      setVerifyError(message);
    }
  }

  function handleSaveBackupDone() {
    setStep('complete');
  }

  // ── Progress bar ───────────────────────────────────────────────────────────

  const currentProgressIndex = PROGRESS_STEPS.indexOf(step as Exclude<WizardStep, 'complete'>);
  const showProgress = step !== 'complete';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) handleClose(); }}>
      <DialogContent
        className="max-w-md w-full p-0 overflow-hidden text-neutral-900 border"
        style={dialogStyle}
      >
        {/* Progress bar section */}
        {showProgress && (
          <div className="px-6 pt-6 pb-4 border-b border-border/40">
            <div className="flex gap-1.5 mb-2">
              {PROGRESS_STEPS.map((s, index) => (
                <div
                  key={s}
                  className="h-1 flex-1 rounded-full transition-colors duration-300"
                  style={{
                    background:
                      index <= currentProgressIndex
                        ? 'var(--color-accent)'
                        : 'rgba(0,0,0,0.1)',
                  }}
                />
              ))}
            </div>
            <p className="text-xs font-body text-neutral-500">
              Step {currentProgressIndex + 1} of {PROGRESS_STEPS.length}
              {currentProgressIndex >= 0 && PROGRESS_STEPS[currentProgressIndex] !== undefined && (
                <> &mdash; {STEP_LABELS[PROGRESS_STEPS[currentProgressIndex]!]}</>
              )}
            </p>
          </div>
        )}

        {/* Step content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {step === 'choose-app' && (
                <StepChooseApp
                  deviceName={deviceName}
                  onDeviceNameChange={setDeviceName}
                  onNext={handleChooseAppNext}
                  isLoading={setupTotp.isPending}
                />
              )}

              {step === 'scan-qr' && totpData && user && (
                <StepScanQr
                  qrCodeUrl={totpData.qrCode}
                  secret={totpData.secret}
                  email={user.email}
                  onNext={handleScanQrNext}
                />
              )}

              {step === 'verify-code' && (
                <StepVerifyCode
                  onVerify={handleVerify}
                  isLoading={verifyTotp.isPending}
                  error={verifyError}
                />
              )}

              {step === 'save-backup' && (
                <StepSaveBackup
                  backupCodes={backupCodes}
                  onDone={handleSaveBackupDone}
                />
              )}

              {step === 'complete' && (
                <StepComplete
                  deviceName={deviceName}
                  onClose={handleClose}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
