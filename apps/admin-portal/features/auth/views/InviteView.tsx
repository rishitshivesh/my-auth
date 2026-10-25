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
import { checkPassword } from "../model/password-policy";
import { tenantOrigin } from "../model/tenant";
import { LinkLandingView } from "./LinkLandingView";

export function InviteView({ token, branding }: { token: string; branding?: PublicTenantBranding | null }) {
  const { t } = useCopy();
  const router = useRouter();
  const { state, pending, failure, accept } = useInvite(token);
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
    // TODO(gap:Invite lifecycle for the invitee): re-requesting an invite has no endpoint; the copy tells the user whom to ask.
    const go = (): void => router.push(authRoutes.login());
    return (
      <HostedFrame title={t("auth.invite.purpose")} description={t("auth.invite.expiredHelp")} branding={branding}>
        <LinkLandingView status={status} purpose={t("auth.invite.purpose")} onContinue={go} onSecondary={go} />
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
          description={t("auth.invite.doneDescription")}
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
