"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField, SentryButton, SentryInput, StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { useInvite } from "../api/use-invite";
import { destinationDefaults } from "../api/tenant-client";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { FormAlert } from "../components/FormAlert";
import { HostedFrame } from "../components/HostedFrame";
import { PasswordInput } from "../components/PasswordInput";
import { SuccessPanel } from "../components/SuccessPanel";
import { passwordIssueText } from "../components/password-issue-text";
import { waitText } from "../components/failure-text";
import { checkPassword } from "../model/password-policy";
import { tenantOrigin } from "../model/tenant";
import { LinkLandingView } from "./LinkLandingView";

export function InviteView({ token, branding }: { token: string; branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const router = useRouter();
  const { state, pending, failure, accept, renewal, requestNew } = useInvite(token);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [declined, setDeclined] = useState(false);

  if (state.status === "loading") {
    return (
      <HostedFrame title={t("auth.invite.purpose")} branding={branding}>
        <StateView kind="loading" title={t("auth.invite.loading")} />
      </HostedFrame>
    );
  }

  if (state.status === "failed") {
    const status = state.phase.status;
    const go = (): void => router.push(authRoutes.login());
    if (renewal.status === "sent") {
      // The old link no longer works once a fresh one is issued, so offer no second request.
      return (
        <HostedFrame title={t("auth.invite.purpose")} branding={branding}>
          <SuccessPanel
            title={t("auth.invite.renewal.sentTitle")}
            description={t("auth.invite.renewal.sent")}
            actionLabel={t("auth.invite.renewal.back")}
            onAction={go}
          />
        </HostedFrame>
      );
    }
    const renewalText = (() => {
      switch (renewal.status) {
        case "cooldown":
          return t("auth.invite.renewal.cooldown", { wait: waitText(renewal.retryAfterSeconds) });
        case "failed":
          return t("auth.invite.renewal.failed");
        default:
          return undefined;
      }
    })();
    return (
      <HostedFrame title={t("auth.invite.purpose")} description={status === "expired" ? t("auth.invite.expiredHelp") : undefined} branding={branding}>
        <LinkLandingView
          status={status}
          purpose={t("auth.invite.purpose")}
          onContinue={status === "expired" ? () => void requestNew() : go}
          onSecondary={go}
          alternateDeviceHint={null}
        />
        <p role="status" aria-live="polite" className="mt-3 text-center font-body text-xs text-muted-foreground">
          {renewal.status === "sending" ? t("auth.invite.renewal.sending") : renewalText}
        </p>
      </HostedFrame>
    );
  }

  if (state.status === "accepted") {
    const { invite } = state;
    const origin = typeof window === "undefined" ? null : tenantOrigin(invite.tenantSlug, window.location, destinationDefaults.rootDomain);
    const path = authRoutes.login({ email: invite.email });
    return (
      <HostedFrame title={t("auth.invite.doneTitle", { workspace: invite.tenantName })} branding={branding}>
        <SuccessPanel
          title={t("auth.invite.doneTitle", { workspace: invite.tenantName })}
          description={state.canSignInNow ? t("auth.invite.doneDescription") : t("auth.invite.doneDescriptionManual")}
          actionLabel={t("auth.invite.doneAction")}
          onAction={() => (origin ? window.location.assign(`${origin}${path}`) : router.push(path))}
        />
      </HostedFrame>
    );
  }

  if (declined) {
    return (
      <HostedFrame title={t("auth.invite.purpose")} branding={branding}>
        <StateView kind="empty" title={t("auth.invite.decline")} description={t("auth.invite.declined")} />
      </HostedFrame>
    );
  }

  const { invite } = state;
  const issue = checkPassword(password, invite.email);
  const passwordError = touched ? (password.length === 0 ? t("common.validation.required") : passwordIssueText(issue)) : undefined;
  const nameError = touched && name.trim().length === 0 ? t("common.validation.required") : undefined;
  const failureText = failure ? (failure.kind === "policy" ? t("auth.invite.failures.policy") : t("auth.invite.failures.generic")) : undefined;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (name.trim().length === 0 || password.length === 0 || issue) return;
    void accept(name.trim(), password);
  };

  return (
    <HostedFrame
      title={t("auth.invite.title", { workspace: invite.tenantName })}
      description={t("auth.invite.description", { email: invite.email })}
      branding={branding}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormAlert message={failureText} reference={failure?.requestId} />
        <FormField label={t("auth.invite.nameLabel")} required error={nameError}>
          {(c) => <SentryInput {...c} name="name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />}
        </FormField>
        <FormField label={t("auth.invite.passwordLabel")} required hint={t("auth.invite.passwordHint")} error={passwordError}>
          {(c) => <PasswordInput control={c} value={password} onChange={setPassword} autoComplete="new-password" disabled={pending} />}
        </FormField>
        <p className="font-body text-xs text-muted-foreground">{t("auth.invite.existingAccountNote")}</p>
        <SentryButton type="submit" className="w-full" isLoading={pending}>
          {pending ? t("auth.invite.accepting") : t("auth.invite.accept")}
        </SentryButton>
        <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={() => setDeclined(true)} disabled={pending}>
          {t("auth.invite.decline")}
        </SentryButton>
      </form>
    </HostedFrame>
  );
}
