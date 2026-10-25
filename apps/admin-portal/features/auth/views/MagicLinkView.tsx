"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { useMagicLanding } from "../api/use-magic-landing";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { HostedFrame } from "../components/HostedFrame";
import { MagicLinkConfirm } from "../components/MagicLinkConfirm";
import { SuccessPanel } from "../components/SuccessPanel";
import { LinkLandingView } from "./LinkLandingView";

/** /u/magic-link?token=… — previews the link; the token is spent only by an explicit choice. */
export function MagicLinkView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const router = useRouter();
  const params = useSearchParams();
  const flow = useMagicLanding(params.get("token"), params.get("next"));
  const { state } = flow;
  const toLogin = (): void => router.push(authRoutes.login());
  const title = t("auth.magicLink.purpose");

  const body = (() => {
    switch (state.phase) {
      case "previewing":
        return <StateView kind="loading" title={t("auth.magicLink.checking")} />;
      case "approved":
        return (
          <SuccessPanel
            title={t("auth.magicLink.approvedTitle")}
            description={t("auth.magicLink.approvedDescription")}
            actionLabel={t("auth.magicLink.approvedAction")}
            onAction={toLogin}
          />
        );
      case "locked":
        return (
          <StateView
            kind="error"
            title={t("auth.magicLink.lockedTitle")}
            description={t("auth.magicLink.lockedDescription")}
            action={{ label: t("auth.magicLink.back"), onClick: toLogin }}
          />
        );
      case "failed":
        return (
          <LinkLandingView
            status={state.status}
            purpose={title}
            workspace={flow.tenantSlug}
            onContinue={toLogin}
            onSecondary={toLogin}
            alternateDeviceHint={null}
          />
        );
      case "ready":
      case "working":
        return (
          <MagicLinkConfirm
            preview={state.preview}
            workspace={flow.tenantSlug}
            pending={state.phase === "working"}
            entering={state.entering}
            attempts={state.attempts}
            codeError={state.phase === "ready" && state.codeError}
            onSignInHere={() => void flow.signInHere()}
            onStartApprove={flow.startEntering}
            onCancelApprove={flow.cancelEntering}
            onApprove={(code) => void flow.approveElsewhere(code)}
            onNotMe={toLogin}
          />
        );
    }
  })();

  return (
    <HostedFrame title={title} branding={branding}>
      {body}
    </HostedFrame>
  );
}
