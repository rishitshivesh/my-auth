"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthProviders, LoginIntentResponse } from "@scrolloop/sdk";
import { describeFailure, type Failure } from "../model/failure";
import { nextStepAfterEmail, resolveMethods, type LoginMethods, type LoginStep } from "../model/login-flow";
import { useAuthApi } from "./use-auth-api";
import { useContinuation } from "./use-continuation";
import { useMagicPoll, type MagicPollInput } from "./use-magic-poll";
import { MAGIC_LINK_DEFAULT_TTL_SECONDS } from "@/constants/limits";

interface FlowState {
  step: LoginStep;
  email: string;
  providers: AuthProviders | null;
  intent: LoginIntentResponse | null;
  pending: boolean;
  failure: Failure | null;
  magic: (MagicPollInput & { matchCode: string }) | null;
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
    magic: null,
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

  const issueLink = async (): Promise<void> => {
    const sent = await api.requestMagicLink(state.email);
    patch({
      magic:
        sent.pollingNonce && sent.matchCode
          ? {
              pollingNonce: sent.pollingNonce,
              matchCode: sent.matchCode,
              expiresInSeconds: sent.expiresInSeconds ?? MAGIC_LINK_DEFAULT_TTL_SECONDS,
              startedAt: Date.now(),
            }
          : null,
    });
  };

  const sendLink = (): Promise<void> =>
    run(async () => {
      await issueLink();
      patch({ step: "email-link-sent" });
    });

  /** A new link supersedes the old one, so a new nonce and match code replace the old pair. */
  const resendLink = (): Promise<void> => issueLink();

  const poll = useMagicPoll(api, state.step === "email-link-sent" ? state.magic : null, proceed);

  const usePasskey = (): Promise<void> => run(async () => proceed(await api.passkey(state.email)));

  const social = (provider: string): void => api.socialLogin(provider);

  const goTo = (step: LoginStep): void => patch({ step, failure: null });

  return { state, methods, poll, submitEmail, submitPassword, sendLink, resendLink, usePasskey, social, goTo };
}
