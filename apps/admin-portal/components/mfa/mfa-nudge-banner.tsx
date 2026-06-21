'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, X, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface MfaNudgeBannerProps {
  daysRemaining: number;
  isExpired: boolean;
  tenantSlug: string;
}

export function MfaNudgeBanner({ daysRemaining, isExpired, tenantSlug }: MfaNudgeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  if (dismissed && !isExpired) return null;

  const urgency =
    isExpired || daysRemaining <= 1 ? 'critical' : daysRemaining <= 3 ? 'warning' : 'info';

  const bgClass =
    urgency === 'critical'
      ? 'bg-destructive/10 border-destructive/30'
      : urgency === 'warning'
        ? 'border-orange-300/50 bg-black/[0.03]'
        : 'border-emerald-300/50 bg-black/[0.03]';

  const textClass =
    urgency === 'critical'
      ? 'text-destructive'
      : urgency === 'warning'
        ? 'text-orange-700'
        : 'text-emerald-700';

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border text-sm font-body mb-6 ${bgClass}`}
        >
          <div className={`flex items-center gap-3 ${textClass}`}>
            {urgency === 'critical' ? (
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
            )}
            <span>
              {isExpired
                ? 'Your MFA grace period has expired. Enable two-factor authentication to continue accessing the portal.'
                : daysRemaining === 1
                  ? 'Last day — set up two-factor authentication today to keep your account secure.'
                  : `Secure your account — you have ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left to enable two-factor authentication.`}
            </span>
          </div>
          <div className={`flex items-center gap-2 flex-shrink-0 ${textClass}`}>
            <button
              onClick={() => router.push(`/t/${tenantSlug}/security`)}
              className="flex items-center gap-1 text-xs font-display font-bold uppercase tracking-wider underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Set up now <ArrowRight className="h-3 w-3" />
            </button>
            {!isExpired && (
              <button
                onClick={() => setDismissed(true)}
                className="hover:opacity-70 transition-opacity ml-1"
                aria-label="Dismiss MFA nudge"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
