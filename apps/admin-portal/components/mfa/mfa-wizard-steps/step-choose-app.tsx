'use client';

import * as React from 'react';
import { Smartphone, Check } from 'lucide-react';
import { SentryButton, SentryInput } from '@repo/ui';
import { cn } from '@repo/ui/lib/utils';

interface AppOption {
  id: string;
  name: string;
  recommended?: boolean;
}

const APP_OPTIONS: AppOption[] = [
  { id: 'google', name: 'Google Authenticator' },
  { id: 'authy', name: 'Authy', recommended: true },
  { id: '1password', name: '1Password' },
  { id: 'microsoft', name: 'Microsoft Authenticator' },
  { id: 'bitwarden', name: 'Bitwarden' },
];

interface StepChooseAppProps {
  deviceName: string;
  onDeviceNameChange: (name: string) => void;
  onNext: () => void;
  isLoading?: boolean;
}

export function StepChooseApp({
  deviceName,
  onDeviceNameChange,
  onNext,
  isLoading,
}: StepChooseAppProps) {
  const [selectedApp, setSelectedApp] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-display font-light text-foreground">
          Get an authenticator app
        </h2>
        <p className="text-sm font-body text-muted-foreground leading-relaxed">
          Authenticator apps generate time-based one-time codes on your phone.
          These codes are required every time you sign in, adding a strong second
          layer of security to your account.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
          Choose an app
        </p>
        <div className="grid gap-2">
          {APP_OPTIONS.map((app) => {
            const isSelected = selectedApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedApp(app.id)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-sm border px-4 py-3 text-left transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20',
                  isSelected
                    ? 'border-accent bg-accent/5 text-foreground'
                    : 'border-border bg-black/5 text-foreground hover:border-accent/40 hover:bg-accent/[0.03]'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-sm border transition-colors',
                    isSelected
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-background text-muted-foreground'
                  )}
                >
                  {isSelected ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Smartphone className="h-4 w-4" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-display font-semibold">
                    {app.name}
                  </span>
                  {app.recommended && (
                    <span className="text-[10px] font-display font-bold uppercase tracking-[0.08em] text-accent">
                      Recommended
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <SentryInput
        label="Name this device (optional)"
        placeholder="e.g. iPhone 15, Work Phone"
        value={deviceName}
        onChange={(e) => onDeviceNameChange(e.target.value)}
      />

      <SentryButton
        type="button"
        variant="primary"
        className="w-full"
        disabled={!selectedApp}
        isLoading={isLoading}
        onClick={onNext}
      >
        I have an app — continue
      </SentryButton>
    </div>
  );
}
