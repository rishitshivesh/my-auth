"use client";

import { SentryButton } from "@repo/ui";
import { KeyRound, Mail } from "lucide-react";
import { useCopy } from "@/i18n";
import type { LoginMethods } from "../model/login-flow";
import { SocialButtons } from "./SocialButtons";

export interface MethodsStepProps {
  email: string;
  methods: LoginMethods;
  pending: boolean;
  onMagicLink: () => void;
  onPasskey: () => void;
  onPassword: () => void;
  onSocial: (provider: string) => void;
  onChangeEmail: () => void;
}

export function MethodsStep({ email, methods, pending, onMagicLink, onPasskey, onPassword, onSocial, onChangeEmail }: MethodsStepProps) {
  const { t } = useCopy();
  return (
    <div className="space-y-4">
      <p className="text-center font-body text-sm text-muted-foreground">{t("auth.login.signedInAs", { email })}</p>
      <div className="space-y-2" role="group" aria-label={t("auth.login.chooseMethod")}>
        {methods.magicLink && (
          <SentryButton type="button" className="w-full" onClick={onMagicLink} disabled={pending}>
            <Mail aria-hidden="true" className="mr-2 h-4 w-4" />
            {t("auth.login.emailLink")}
          </SentryButton>
        )}
        {methods.passkey && (
          <SentryButton type="button" variant="outline" className="w-full" onClick={onPasskey} disabled={pending}>
            <KeyRound aria-hidden="true" className="mr-2 h-4 w-4" />
            {t("auth.login.passkey")}
          </SentryButton>
        )}
        <SocialButtons providers={methods.social} onSelect={onSocial} disabled={pending} />
        {methods.password && (
          <SentryButton type="button" variant="outline" className="w-full" onClick={onPassword} disabled={pending}>
            {t("auth.login.usePassword")}
          </SentryButton>
        )}
      </div>
      <SentryButton type="button" variant="ghost" size="sm" className="w-full border-0" onClick={onChangeEmail}>
        {t("auth.login.changeEmail")}
      </SentryButton>
    </div>
  );
}
