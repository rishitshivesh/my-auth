"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormField, SentryInput } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { email as emailValidator, required, validate } from "@/lib/validation";
import { useAuthApi } from "../api/use-auth-api";
import { useDestination } from "../api/use-destination";
import { useLinkRedemption } from "../api/use-link-redemption";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { HostedFrame } from "../components/HostedFrame";
import { LinkSentStep } from "../components/LinkSentStep";
import { ResendControl } from "../components/ResendControl";
import { SuccessPanel } from "../components/SuccessPanel";
import { isPlausibleToken, landingStatus, linkTarget } from "../model/link";
import { LinkLandingView } from "./LinkLandingView";

export function VerifyEmailView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const { api, tenantSlug } = useAuthApi();
  const { resolve } = useDestination();
  const { phase, redeem } = useLinkRedemption(api.verifyEmail);
  const [typedEmail, setTypedEmail] = useState("");
  const email = (params.get("email") ?? typedEmail).trim();
  const next = resolve(params.get("next"))?.href;
  const toLogin = (): void => router.push(authRoutes.login({ next, email: params.get("email") ?? undefined }));

  if (phase.phase === "done") {
    return (
      <HostedFrame title={t("auth.verifyEmail.doneTitle")} branding={branding}>
        <SuccessPanel
          title={t("auth.verifyEmail.doneTitle")}
          description={t("auth.verifyEmail.doneDescription")}
          actionLabel={t("auth.verifyEmail.doneAction")}
          onAction={toLogin}
        />
      </HostedFrame>
    );
  }

  if (token !== null) {
    const valid = isPlausibleToken(token);
    const status = landingStatus(phase, valid);
    const run = (side: "primary" | "secondary"): void => {
      const target = linkTarget(status, side);
      if (target === "redeem" && valid) void redeem(token);
      else if (target === "request") router.push(authRoutes.verifyEmail({ email: params.get("email") ?? undefined }));
      else toLogin();
    };
    return (
      <HostedFrame title={t("auth.verifyEmail.purpose")} branding={branding}>
        <LinkLandingView
          status={status}
          purpose={t("auth.verifyEmail.purpose")}
          workspace={tenantSlug}
          validDescription={t("auth.verifyEmail.validDescription")}
          onContinue={() => run("primary")}
          onSecondary={() => run("secondary")}
          alternateDeviceHint={t("auth.verifyEmail.otherDevice")}
        />
      </HostedFrame>
    );
  }

  const queryEmail = params.get("email");
  const emailIssue = typedEmail.length > 0 ? validate(typedEmail, [required, emailValidator]) : null;
  const resend = async (): Promise<void> => void (await api.resendVerification(email));

  if (queryEmail) {
    return (
      <HostedFrame title={t("auth.verifyEmail.sentTitle")} branding={branding}>
        <LinkSentStep
          title={t("auth.verifyEmail.sentTitle")}
          description={t("auth.verifyEmail.sentDescription", { email })}
          email={email}
          onResend={resend}
          resendFailure={t("auth.verifyEmail.resendFailed")}
          backLabel={t("auth.magicLink.back")}
          onBack={toLogin}
        />
      </HostedFrame>
    );
  }

  return (
    <HostedFrame title={t("auth.verifyEmail.sentTitle")} description={t("auth.verifyEmail.sentDescriptionNoEmail")} branding={branding}>
      <div className="space-y-4">
        <FormField label={t("auth.verifyEmail.resendEmailLabel")} hint={t("auth.verifyEmail.resendNeedsEmail")} error={emailIssue ? t("common.validation.email") : undefined}>
          {(control) => (
            <SentryInput {...control} type="email" autoComplete="email" value={typedEmail} onChange={(e) => setTypedEmail(e.target.value)} />
          )}
        </FormField>
        {email.length > 0 && !emailIssue && (
          <ResendControl key={email} startCooling={false} onResend={resend} email={email} failureMessage={t("auth.verifyEmail.resendFailed")} />
        )}
      </div>
    </HostedFrame>
  );
}
