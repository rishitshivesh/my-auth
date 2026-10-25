"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { useAuthApi } from "../api/use-auth-api";
import { useContinuation } from "../api/use-continuation";
import { useLinkRedemption } from "../api/use-link-redemption";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { HostedFrame } from "../components/HostedFrame";
import { isPlausibleToken, landingStatus, linkTarget } from "../model/link";
import { defaultDashboard } from "../model/outcome";
import { LinkLandingView } from "./LinkLandingView";

/** /u/magic-link?token=… — the token is spent only when the user presses Continue. */
export function MagicLinkView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const { api, tenantSlug } = useAuthApi();
  const proceed = useContinuation(tenantSlug, params.get("next"));
  const { phase, redeem } = useLinkRedemption(api.verifyMagicLink);
  const valid = isPlausibleToken(token);
  const status = landingStatus(phase, valid);

  const go = (target: ReturnType<typeof linkTarget>): void => {
    if (target === "redeem" && valid) {
      void redeem(token).then((outcome) => outcome && proceed(outcome));
    } else if (target === "home") {
      router.replace(defaultDashboard(tenantSlug));
    } else {
      router.push(authRoutes.login());
    }
  };

  return (
    <HostedFrame title={t("auth.magicLink.purpose")} branding={branding}>
      <LinkLandingView
        status={phase.phase === "done" ? "pending" : status}
        purpose={t("auth.magicLink.purpose")}
        workspace={tenantSlug}
        validDescription={t("auth.magicLink.validDescription", { workspace: tenantSlug })}
        alternateDeviceHint={null}
        onContinue={() => go(linkTarget(status, "primary"))}
        onSecondary={() => go(linkTarget(status, "secondary"))}
      />
    </HostedFrame>
  );
}
