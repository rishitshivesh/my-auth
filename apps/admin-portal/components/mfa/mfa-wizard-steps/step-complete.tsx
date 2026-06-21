'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Smartphone, Bell, Key } from 'lucide-react';
import { SentryButton } from '@repo/ui';

interface StepCompleteProps {
  deviceName: string;
  onClose: () => void;
}

const WHAT_NEXT_ITEMS = [
  {
    icon: Smartphone,
    title: 'Every sign-in is protected',
    description:
      'You will be prompted for your authenticator code each time you sign in.',
  },
  {
    icon: Key,
    title: 'Use backup codes if needed',
    description:
      'If you lose access to your device, use your saved backup codes to sign in.',
  },
  {
    icon: Bell,
    title: 'Manage from Security settings',
    description:
      'You can remove, update, or regenerate backup codes at any time from your security settings.',
  },
];

export function StepComplete({ deviceName, onClose }: StepCompleteProps) {
  return (
    <div className="space-y-6">
      {/* Animated shield icon */}
      <div className="flex flex-col items-center gap-4 pt-2">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 20,
            duration: 0.6,
          }}
          className="relative"
        >
          {/* Glow backdrop */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 -m-4 rounded-full blur-2xl"
            style={{ background: 'var(--color-accent)', opacity: 0.15 }}
          />
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-full border"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
            }}
          >
            <ShieldCheck
              className="h-10 w-10"
              style={{ color: 'var(--color-accent)' }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-1.5 text-center"
        >
          <h2 className="text-xl font-display font-semibold text-foreground">
            Two-factor authentication enabled!
          </h2>
          {deviceName && (
            <p className="text-sm font-body text-muted-foreground">
              Device registered as{' '}
              <span className="font-display font-semibold text-foreground">
                {deviceName}
              </span>
            </p>
          )}
        </motion.div>
      </div>

      {/* What's next card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-sm border border-border bg-black/5 divide-y divide-border"
      >
        <p className="px-4 py-3 text-[10px] font-display font-bold uppercase tracking-[0.09em] text-muted-foreground">
          What&apos;s next
        </p>
        {WHAT_NEXT_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex items-start gap-3 px-4 py-3">
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm border"
                style={{
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
                }}
              >
                <Icon
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--color-accent)' }}
                />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-display font-semibold text-foreground">
                  {item.title}
                </p>
                <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        <SentryButton
          type="button"
          variant="accent"
          className="w-full"
          onClick={onClose}
        >
          Done
        </SentryButton>
      </motion.div>
    </div>
  );
}
