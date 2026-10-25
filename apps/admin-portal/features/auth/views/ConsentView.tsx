"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { SentryButton, StateView } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { useConsent } from "../api/use-consent";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { FormAlert } from "../components/FormAlert";
import { HostedFrame } from "../components/HostedFrame";
import { describeScopes, safeExternalUrl } from "../model/consent";

export function ConsentView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t, tk } = useCopy();
  const params = useSearchParams();
  const transactionId = params.get("transaction_id");
  const { state, pending, failure, decide, tenantSlug } = useConsent(transactionId);
  const [remember, setRemember] = useState(false);
  const login = authRoutes.login({ next: authRoutes.consent({ transaction_id: transactionId ?? undefined }) });

  if (state.status === "loading" || state.status === "redirecting") {
    const redirecting = state.status === "redirecting";
    return (
      <HostedFrame title={t("auth.consent.loading")} branding={branding}>
        <StateView kind="loading" title={redirecting ? t("auth.consent.redirecting") : t("auth.consent.loading")} />
      </HostedFrame>
    );
  }

  if (state.status === "issue") {
    const copy = {
      "sign-in-required": { title: t("auth.consent.signInRequiredTitle"), description: t("auth.consent.signInRequiredDescription"), action: { label: t("auth.consent.signIn"), href: login } },
      expired: { title: t("auth.consent.expiredTitle"), description: t("auth.consent.expiredDescription"), action: null },
      invalid: { title: t("auth.consent.invalidTitle"), description: t("auth.consent.invalidDescription"), action: null },
      error: { title: t("auth.consent.invalidTitle"), description: t("auth.consent.invalidDescription"), action: null },
    }[state.issue];
    return (
      <HostedFrame title={copy.title} description={copy.description} branding={branding}>
        <StateView kind={state.issue === "sign-in-required" ? "denied" : "unavailable"} title={copy.title} description={copy.description} />
        {copy.action && (
          <SentryButton asChild variant="accent" className="w-full">
            <Link href={copy.action.href}>{copy.action.label}</Link>
          </SentryButton>
        )}
      </HostedFrame>
    );
  }

  const { details, account } = state;
  const app = details.client.name;
  const links = [
    { label: t("auth.consent.website"), url: safeExternalUrl(details.client.website_url) },
    { label: t("auth.consent.privacy"), url: safeExternalUrl(details.client.privacy_policy_url) },
    { label: t("auth.consent.terms"), url: safeExternalUrl(details.client.terms_of_service_url) },
  ].filter((l): l is { label: string; url: string } => l.url !== null);

  return (
    <HostedFrame title={t("auth.consent.title", { app, workspace: tenantSlug })} description={t("auth.consent.description", { app })} branding={branding}>
      <div className="space-y-4">
        <FormAlert message={failure ? t("auth.login.failures.generic") : undefined} reference={failure?.requestId} />
        {account && <p className="rounded-sm bg-accent/10 p-3 font-mono text-xs text-foreground">{t("auth.login.signedInAs", { email: account })}</p>}
        <section aria-labelledby="consent-scopes">
          <h2 id="consent-scopes" className="mb-2 font-display text-sm font-semibold text-foreground">{t("auth.consent.willBeAble", { app })}</h2>
          <ul className="space-y-1.5">
            {describeScopes(details.scopes).map(({ scope, copyKey }) => (
              <li key={scope} className="flex items-start gap-2 font-body text-sm text-foreground">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
                <span className={copyKey ? undefined : "font-mono text-xs"}>{copyKey ? tk(copyKey) : scope}</span>
              </li>
            ))}
          </ul>
        </section>
        <label className="flex items-center gap-2 font-body text-sm text-foreground">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={pending} />
          {t("auth.consent.remember")}
        </label>
        <div className="flex flex-col gap-2">
          <SentryButton type="button" className="w-full" isLoading={pending} onClick={() => void decide("allow", remember)}>
            {t("auth.consent.allow")}
          </SentryButton>
          <SentryButton type="button" variant="outline" className="w-full" disabled={pending} onClick={() => void decide("deny", false)}>
            {t("auth.consent.deny")}
          </SentryButton>
        </div>
        <p className="text-center font-body text-xs text-muted-foreground">{t("auth.consent.trust")}</p>
        {links.length > 0 && (
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-body text-xs">
            {links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">{l.label}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </HostedFrame>
  );
}
