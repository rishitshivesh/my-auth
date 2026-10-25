"use client";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, SentryButton,
} from "@repo/ui";
import { useCopy } from "@/i18n";
import type { CreatedOAuthClient } from "../model/types";
import { CopyableValue } from "./CopyableValue";
import { OneTimeSecretDialog } from "./OneTimeSecretDialog";

export interface CreatedCredentialsDialogProps {
  created: CreatedOAuthClient | null;
  /** Fires after the user acknowledges; the parent drops the client (and its secret) from state. */
  onDone: () => void;
}

/** Confidential clients get the one-time secret dialog; public clients a plain confirmation. */
export function CreatedCredentialsDialog({ created, onDone }: CreatedCredentialsDialogProps) {
  const { t } = useCopy();
  if (!created) return null;
  const details = <CopyableValue label={t("tenantIntegrations.common.clientId")} value={created.clientId} />;

  if (created.clientSecret) {
    return (
      <OneTimeSecretDialog
        open
        title={t("tenantIntegrations.apps.secretDialog.title")}
        description={t("tenantIntegrations.apps.secretDialog.description")}
        secret={created.clientSecret}
        details={details}
        footnote={t("tenantIntegrations.apps.secretDialog.next")}
        onAcknowledge={onDone}
      />
    );
  }
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onDone(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tenantIntegrations.apps.secretDialog.publicTitle")}</DialogTitle>
          <DialogDescription>{t("tenantIntegrations.apps.secretDialog.publicDescription")}</DialogDescription>
        </DialogHeader>
        {details}
        <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.apps.create.pkceNote")}</p>
        <SentryButton variant="primary" onClick={onDone}>{t("common.actions.continue")}</SentryButton>
      </DialogContent>
    </Dialog>
  );
}
