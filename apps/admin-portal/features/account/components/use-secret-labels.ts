"use client";

import { useMemo } from "react";
import type { SecretRevealLabels } from "@repo/ui";
import { useCopy } from "@/i18n";

/** Copy for SecretReveal, from the shared catalogue; `warning` can be overridden per secret. */
export function useSecretLabels(warning?: string, acknowledge?: string): SecretRevealLabels {
  const { t } = useCopy();
  return useMemo(
    () => ({
      warning: warning ?? t("common.secret.warning"),
      copy: t("common.actions.copy"),
      copied: t("common.actions.copied"),
      copyFailed: t("account.security.copyFailed"),
      show: t("common.actions.reveal"),
      hide: t("common.actions.hide"),
      hiddenValue: t("common.secret.hiddenLabel"),
      acknowledge: acknowledge ?? t("common.secret.acknowledge"),
    }),
    [t, warning, acknowledge],
  );
}
