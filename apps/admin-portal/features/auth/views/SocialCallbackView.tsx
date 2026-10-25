"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { accountRoutes, authRoutes } from "@/constants/routes";
import { useAuthApi } from "../api/use-auth-api";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { HostedFrame } from "../components/HostedFrame";
import { defaultDashboard } from "../model/outcome";
import { isPlausibleToken } from "../model/link";

type CallbackState = "working" | "failed" | "incomplete" | "link-done";

/**
 * Provider callback: `?ct=` completion token, `?error=` provider/cancel failure, `?mode=link`
 * account linking. Redirect from the provider is the user's own action, so the completion
 * token is claimed once on mount (guarded against double effects). Raw error text is never shown.
 * TODO(gap:Social login completion claims): claim-session returns no claims; MFA after social login is not modelled.
 */
export function SocialCallbackView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const router = useRouter();
  const params = useSearchParams();
  const { api, tenantSlug } = useAuthApi();
  const claimed = useRef(false);
  const ct = params.get("ct");
  const isLink = params.get("mode") === "link";
  const hasError = params.get("error") !== null;
  const [state, setState] = useState<CallbackState>(hasError ? "failed" : isLink ? "link-done" : isPlausibleToken(ct) ? "working" : "incomplete");

  useEffect(() => {
    if (state !== "working" || claimed.current || !isPlausibleToken(ct)) return;
    claimed.current = true;
    api
      .claimSocial(ct)
      .then((slug) => router.replace(defaultDashboard(slug ?? tenantSlug)))
      .catch(() => setState("failed"));
  }, [api, ct, router, state, tenantSlug]);

  const back = { label: t("auth.social.back"), onClick: () => router.replace(authRoutes.login()) };

  return (
    <HostedFrame title={t("auth.social.working")} branding={branding}>
      {state === "working" && <StateView kind="loading" title={t("auth.social.workingDescription")} />}
      {state === "failed" && <StateView kind="error" title={t("auth.social.failedTitle")} description={t("auth.social.failedDescription")} action={back} />}
      {state === "incomplete" && <StateView kind="error" title={t("auth.social.failedTitle")} description={t("auth.social.missingToken")} action={back} />}
      {state === "link-done" && (
        <StateView
          kind="empty"
          title={t("auth.social.working")}
          description={t("auth.social.linkingNote")}
          action={{ label: t("common.actions.continue"), onClick: () => router.replace(accountRoutes.security()) }}
        />
      )}
    </HostedFrame>
  );
}
