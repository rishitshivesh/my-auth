"use client";

import { ConfirmDialog } from "@repo/ui";
import { useCopy } from "@/i18n";

export type PersonDialogAction = "suspend" | "reactivate" | "delete" | "forceReset" | "revokeSessions";

export interface PersonActionDialogProps {
  action: PersonDialogAction | null;
  personName: string;
  onClose: () => void;
  onConfirm: (action: PersonDialogAction) => void;
  pending: boolean;
  error?: string;
  /** Present when the API demands a fresh sign-in. */
  recentAuth?: { onReauthenticate: () => void };
}

const DESTRUCTIVE: ReadonlySet<PersonDialogAction> = new Set(["suspend", "delete", "revokeSessions"]);

/** One confirmation per lifecycle action: states the effect, never implies success before the server confirms. */
export function PersonActionDialog({ action, personName, onClose, onConfirm, pending, error, recentAuth }: PersonActionDialogProps) {
  const { t, tk } = useCopy();
  const key = action ?? "suspend";
  return (
    <ConfirmDialog
      open={action !== null}
      onOpenChange={(open) => !open && onClose()}
      title={tk(`users.actions.${key}.title`, { name: personName })}
      description={tk(`users.actions.${key}.description`, { name: personName })}
      effectsHeading={t("common.dialog.effectHeading")}
      effects={[tk(`users.actions.${key}.effect1`), tk(`users.actions.${key}.effect2`)]}
      confirmLabel={tk(`users.actions.${key}.confirm`)}
      cancelLabel={t("common.actions.cancel")}
      destructive={DESTRUCTIVE.has(key)}
      confirmPhrase={action === "delete" ? personName : undefined}
      confirmPhraseLabel={action === "delete" ? t("common.dialog.typeToConfirm", { phrase: personName }) : undefined}
      pending={pending}
      error={error}
      recentAuth={recentAuth ? { required: true, notice: t("common.dialog.recentAuthNotice"), actionLabel: t("common.dialog.recentAuthAction"), onReauthenticate: recentAuth.onReauthenticate } : undefined}
      onConfirm={() => { void (action && onConfirm(action)); }}
    />
  );
}
