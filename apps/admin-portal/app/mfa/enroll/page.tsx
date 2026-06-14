'use client';

import * as React from 'react';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { GlassCard, SentryButton, SentryInput, TokenDisplay } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";
import { useSetupTotp, useVerifyTotp } from '@/lib/queries';
import { ShieldCheck, Smartphone, Key, CheckCircle2, ChevronRight, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';


export default function MfaEnrollPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<'method' | 'setup' | 'backup' | 'success'>('method');
  
  const { mutate: setupTotp, data: totpData, isPending: isSettingUp } = useSetupTotp();
  const { mutate: verifyTotp, isPending: isVerifying } = useVerifyTotp();
  
  const [code, setCode] = React.useState('');

  const handleStartTotp = () => {
    setupTotp(undefined, {
      onSuccess: () => setStep('setup')
    });
  };

  const handleVerify = () => {
    verifyTotp(code, {
      onSuccess: () => setStep('backup')
    });
  };

  return (
    <AuthLayout>
      <div className="space-y-8 animate-fade-up">
        {/* Step Indicator */}
        <div className="flex justify-center gap-2 mb-2">
          {['method', 'setup', 'backup', 'success'].map((s, i) => (
            <div 
              key={s} 
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                step === s ? "w-8 bg-accent" : "w-4 bg-black/5"
              )} 
            />
          ))}
        </div>

        {step === 'method' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold">Secure your account</h2>
              <p className="text-sm font-body text-muted-foreground">Choose a multi-factor authentication method.</p>
            </div>
            
            <div className="space-y-3">
              <button 
                onClick={handleStartTotp}
                className="w-full text-left group focus:outline-none"
              >
                <GlassCard tier={1} className="p-4 flex items-center gap-4 group-hover:border-accent/30 transition-all">
                  <div className="p-2.5 rounded-sm bg-accent/10 text-accent">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-display font-semibold">Authenticator App</p>
                    <p className="text-xs font-body text-muted-foreground">Use Google Authenticator or Authy</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-accent transition-colors" />
                </GlassCard>
              </button>

              <button className="w-full text-left group opacity-50 cursor-not-allowed">
                <GlassCard tier={1} className="p-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-sm bg-black/5 text-muted-foreground">
                    <Key className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-display font-semibold">Hardware Security Key</p>
                    <p className="text-xs font-body text-muted-foreground">YubiKey or Titan Key (FIDO2)</p>
                  </div>
                </GlassCard>
              </button>
            </div>
          </div>
        )}

        {step === 'setup' && totpData && (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-display font-semibold">Setup App</h2>
              <p className="text-sm font-body text-muted-foreground">Scan the QR code in your auth app.</p>
            </div>

            <div className="flex justify-center p-4 bg-white rounded-sm border border-border">
              <img src={totpData.qrCode} alt="QR Code" className="w-48 h-48 grayscale hover:grayscale-0 transition-all" />
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5 text-center">
                <p className="text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground/60">Or enter manually</p>
                <code className="text-xs font-mono font-bold bg-black/5 px-2 py-1 rounded-sm">{totpData.secret}</code>
              </div>

              <SentryInput
                label="Verification Code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
              />

              <SentryButton 
                variant="accent" 
                className="w-full" 
                onClick={handleVerify}
                isLoading={isVerifying}
                disabled={code.length !== 6}
              >
                Verify & Continue
              </SentryButton>
            </div>
          </div>
        )}

        {step === 'backup' && totpData && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold">Backup Codes</h2>
              <p className="text-sm font-body text-muted-foreground">Store these safely. You'll need them if you lose access to your device.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-black/5 p-4 rounded-sm border border-border">
              {totpData.backupCodes.map(c => (
                <code key={c} className="text-xs font-mono text-muted-foreground">{c}</code>
              ))}
            </div>

            <div className="space-y-3 pt-4">
              <SentryButton variant="ghost" className="w-full gap-2 h-10">
                <Copy className="w-3.5 h-3.5" />
                Copy to Clipboard
              </SentryButton>
              <SentryButton variant="primary" className="w-full h-10" onClick={() => setStep('success')}>
                I've Saved Them
              </SentryButton>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-8 py-4 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-accent animate-scale-in">
                <CheckCircle2 className="w-10 h-10" strokeWidth={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold">Protection Active</h2>
              <p className="text-sm font-body text-muted-foreground">Your account is now secured with MFA.</p>
            </div>
            <SentryButton variant="accent" className="w-full h-10" onClick={() => router.push('/dashboard')}>
              Go to Dashboard
            </SentryButton>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
