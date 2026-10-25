"use client";

import { LinkLanding, type LinkLandingStatus } from "@repo/ui";
import { useCopy } from "@/i18n";

export interface LinkLandingViewProps {
  status: LinkLandingStatus;
  /** Localised purpose, e.g. t("auth.linkLanding.purposes.verifyEmail"). */
  purpose: string;
  account?: string;
  workspace?: string;
  onContinue?: () => void;
  onSecondary?: () => void;
}

export function LinkLandingView({ status, purpose, account = "", workspace = "", onContinue, onSecondary }: LinkLandingViewProps) {
  const { t } = useCopy();
  const copy = (() => {
    switch (status) {
      case "valid":
        return {
          title: purpose,
          description: t("auth.linkLanding.valid.description", { account, workspace }),
          action: t("auth.linkLanding.valid.action"),
          secondaryAction: t("auth.linkLanding.valid.cancel"),
        };
      case "expired":
        return { title: t("auth.linkLanding.expired.title"), description: t("auth.linkLanding.expired.description"), action: t("auth.linkLanding.expired.action"), secondaryAction: t("auth.linkLanding.expired.cancel") };
      case "used":
        return { title: t("auth.linkLanding.used.title"), description: t("auth.linkLanding.used.description"), action: t("auth.linkLanding.used.action"), secondaryAction: t("auth.linkLanding.used.cancel") };
      case "invalid":
        return { title: t("auth.linkLanding.invalid.title"), description: t("auth.linkLanding.invalid.description"), action: t("auth.linkLanding.invalid.action"), secondaryAction: t("auth.linkLanding.invalid.cancel") };
      case "wrong-account":
        return { title: t("auth.linkLanding.wrongAccount.title"), description: t("auth.linkLanding.wrongAccount.description", { account }), action: t("auth.linkLanding.wrongAccount.action"), secondaryAction: t("auth.linkLanding.wrongAccount.cancel") };
      case "pending":
        return { title: t("auth.linkLanding.pending.title"), description: t("auth.linkLanding.pending.description") };
      default:
        return { title: t("auth.linkLanding.loading.title"), description: t("auth.linkLanding.loading.description") };
    }
  })();
  return (
    <LinkLanding
      status={status}
      copy={copy}
      onPrimary={onContinue}
      onSecondary={onSecondary}
      alternateDeviceHint={t("auth.linkLanding.alternateDevice")}
    />
  );
}
