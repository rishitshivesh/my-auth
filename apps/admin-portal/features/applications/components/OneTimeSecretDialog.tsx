"use client";

import type { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, SecretReveal,
} from "@repo/ui";
import { SECRET_AUTO_HIDE_MS } from "@/constants/limits";
import { useCopy } from "@/i18n";

export interface OneTimeSecretDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** The secret; the parent clears it from state when `onAcknowledge` fires. */
  secret: string;
  /** Non-secret details shown above the secret, e.g. the client ID. */
  details?: ReactNode;
  footnote?: string;
  onAcknowledge: () => void;
}

/**
 * Modal that cannot be dismissed by Escape or an outside click: closing it
 * would silently discard a secret that is never shown again.
 */
export function OneTimeSecretDialog({
  open, title, description, secret, details, footnote, onAcknowledge,
}: OneTimeSecretDialogProps) {
  const { t } = useCopy();
  const labels = {
    warning: t("tenantIntegrations.common.secretWarning"),
    copy: t("common.actions.copy"),
    copied: t("tenantIntegrations.common.secretCopied"),
    copyFailed: t("tenantIntegrations.common.copyFailed"),
    show: t("tenantIntegrations.common.secretShow"),
    hide: t("tenantIntegrations.common.secretHide"),
    hiddenValue: t("tenantIntegrations.common.secretHidden"),
    acknowledge: t("tenantIntegrations.common.secretAcknowledge"),
  };
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {details}
        <SecretReveal
          secret={secret}
          labels={labels}
          fieldLabel={t("tenantIntegrations.common.secretField")}
          autoHideMs={SECRET_AUTO_HIDE_MS}
          onAcknowledge={onAcknowledge}
        />
        {footnote && <p className="font-body text-xs text-muted-foreground">{footnote}</p>}
      </DialogContent>
    </Dialog>
  );
}
