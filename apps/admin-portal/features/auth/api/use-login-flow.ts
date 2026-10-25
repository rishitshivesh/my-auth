"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthProviders, LoginIntentResponse } from "@scrolloop/sdk";
import { describeFailure, type Failure } from "../model/failure";
import { nextStepAfterEmail, resolveMethods, type LoginMethods, type LoginStep } from "../model/login-flow";
import { useAuthApi } from "./use-auth-api";
import { useContinuation } from "./use-continuation";

interface FlowState {
  step: LoginStep;
  email: string;
  providers: AuthProviders | null;
  intent: LoginIntentResponse | null;
  pending: boolean;
  failure: Failure | null;
}

export function useLoginFlow(initialEmail: string, next: string | null, initialFailure: boolean) {
  const { api, tenantSlug } = useAuthApi();
  const proceed = useContinuation(tenantSlug, next);
  const [state, setState] = useState<FlowState>({
    step: "email",
    email: initialEmail,
    providers: null,
    intent: null,
    pending: false,
    failure: initialFailure ? { kind: "generic", fieldErrors: {} } : null,
  });

  const patch = useCallback((change: Partial<FlowState>) => setState((s) => ({ ...s, ...change })), []);

  useEffect(() => {
    let live = true;
    api.providers().then((providers) => live && patch({ providers })).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, patch]);

  const methods: LoginMethods = resolveMethods(state.providers, state.intent);

  const run = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      patch({ pending: true, failure: null });
      try {
        await action();
        patch({ pending: false });
      } catch (error) {
        patch({ pending: false, failure: describeFailure(error) });
      }
    },
    [patch],
  );

  const submitEmail = (email: string): Promise<void> =>
    run(async () => {
      const intent = await api.intent(email);
      const resolved = resolveMethods(state.providers, intent);
      setState((s) => ({ ...s, email, intent, step: nextStepAfterEmail(resolved) }));
    });

  const submitPassword = (password: string): Promise<void> =>
    run(async () => proceed(await api.login(state.email, password)));

  const sendLink = (): Promise<void> =>
    run(async () => {
      await api.sendMagicLink(state.email);
      patch({ step: "email-link-sent" });
    });

  const resendLink = (): Promise<void> => api.sendMagicLink(state.email);

  const usePasskey = (): Promise<void> => run(async () => proceed(await api.passkey(state.email)));

  const social = (provider: string): void => api.socialLogin(provider);

  const goTo = (step: LoginStep): void => patch({ step, failure: null });

  return { state, methods, submitEmail, submitPassword, sendLink, resendLink, usePasskey, social, goTo };
}
