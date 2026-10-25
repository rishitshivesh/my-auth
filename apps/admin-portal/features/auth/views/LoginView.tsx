"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StepFlow, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { authRoutes } from "@/constants/routes";
import { useLoginFlow } from "../api/use-login-flow";
import { authServiceUrl } from "../api/tenant-client";
import type { PublicTenantBranding } from "../api/tenant-branding";
import { EmailStep } from "../components/EmailStep";
import { FormAlert } from "../components/FormAlert";
import { loginFailureText } from "../components/failure-text";
import { HostedFrame } from "../components/HostedFrame";
import { LinkSentStep } from "../components/LinkSentStep";
import { MethodsStep } from "../components/MethodsStep";
import { PasswordStep } from "../components/PasswordStep";
import { hasAnyMethod, LOGIN_STEP_ORDER } from "../model/login-flow";
import { parseLoginParams } from "../model/login-params";

export function LoginView({ branding }: { branding?: PublicTenantBranding | null }) {
  const { t, tk } = useCopy();
  const params = parseLoginParams(useSearchParams(), authServiceUrl);
  const flow = useLoginFlow(params.email, params.next, params.hasError);
  const { state, methods } = flow;
  const showSteps = state.step !== "email-link-sent";
  const failureText = state.failure ? loginFailureText(state.failure) : undefined;
  const description = params.isSamlContinuation ? t("auth.login.samlContinue") : t("auth.login.description");
  const stepIds = LOGIN_STEP_ORDER.map((id) => ({ id, label: tk(`auth.login.steps.${id}`) }));
  const stepIndex = LOGIN_STEP_ORDER.findIndex((id) => id === state.step);

  const body = (() => {
    switch (state.step) {
      case "email":
        return (
          <EmailStep
            initialEmail={state.email}
            pending={state.pending}
            social={methods.social}
            onSubmit={(email) => void flow.submitEmail(email)}
            onSocial={flow.social}
          />
        );
      case "methods":
        return hasAnyMethod(methods) ? (
          <MethodsStep
            email={state.email}
            methods={methods}
            pending={state.pending}
            onMagicLink={() => void flow.sendLink()}
            onPasskey={() => void flow.usePasskey()}
            onPassword={() => flow.goTo("password")}
            onSocial={flow.social}
            onChangeEmail={() => flow.goTo("email")}
          />
        ) : (
          <FormAlert message={t("auth.login.noMethods")} />
        );
      case "password":
        return (
          <PasswordStep
            email={state.email}
            pending={state.pending}
            onSubmit={(password) => void flow.submitPassword(password)}
            onBack={() => flow.goTo(methods.magicLink || methods.passkey || methods.social.length > 0 ? "methods" : "email")}
          />
        );
      case "email-link-sent":
        return (
          <LinkSentStep
            title={t("auth.magicLink.sentTitle")}
            description={t("auth.magicLink.sentDescription", { email: state.email })}
            hint={t("auth.magicLink.sentHint")}
            email={state.email}
            onResend={flow.resendLink}
            resendFailure={t("auth.magicLink.resendFailed")}
            backLabel={t("auth.magicLink.back")}
            onBack={() => flow.goTo("methods")}
          />
        );
    }
  })();

  return (
    <HostedFrame
      title={t("auth.login.title")}
      description={description}
      branding={branding}
      footer={
        <Link href={authRoutes.signup()} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("auth.login.newHere")}
        </Link>
      }
    >
      {showSteps && stepIndex >= 0 && (
        <StepFlow
          steps={stepIds}
          currentId={state.step}
          progressLabel={t("auth.steps.progress", { current: stepIndex + 1, total: LOGIN_STEP_ORDER.length })}
          stepLabel={(step, index) => t("auth.steps.stepLabel", { index: index + 1, label: step.label })}
        >
          <FormAlert message={failureText} reference={state.failure?.requestId} className="mb-4" />
          {state.failure?.kind === "email-unverified" && (
            <SentryButton asChild variant="outline" className="mb-4 w-full">
              <Link href={authRoutes.verifyEmail({ email: state.email })}>{t("auth.login.verifyEmailAction")}</Link>
            </SentryButton>
          )}
          {body}
        </StepFlow>
      )}
      {!showSteps && body}
    </HostedFrame>
  );
}
