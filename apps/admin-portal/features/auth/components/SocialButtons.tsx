"use client";

import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { providerLabel } from "../model/providers";

export interface SocialButtonsProps {
  providers: readonly string[];
  onSelect: (provider: string) => void;
  disabled?: boolean;
}

export function SocialButtons({ providers, onSelect, disabled }: SocialButtonsProps) {
  const { t } = useCopy();
  if (providers.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {providers.map((provider) => (
        <li key={provider} className="contents">
          <SentryButton
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onSelect(provider)}
            aria-label={t("auth.login.socialProvider", { provider: providerLabel(provider) })}
          >
            {providerLabel(provider)}
          </SentryButton>
        </li>
      ))}
    </ul>
  );
}
