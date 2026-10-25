"use client";

import { useCallback, useEffect, useState } from "react";
import { describeFailure, type Failure } from "../model/failure";
import type { StoredChallenge } from "../model/challenge";
import { clearChallenge, loadChallenge } from "./challenge-store";
import { runMfaPasskey } from "./mfa-passkey";
import { useAuthApi } from "./use-auth-api";
import { useContinuation } from "./use-continuation";

export type ChallengeState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; challenge: StoredChallenge };

export type CodeMode = "totp" | "email" | "backup";

export function useMfaChallenge() {
  const { api, tenantSlug } = useAuthApi();
  const [state, setState] = useState<ChallengeState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const next = state.status === "ready" ? state.challenge.next ?? null : null;
  const carried = state.status === "ready" ? state.challenge.redirectUri : undefined;
  const proceed = useContinuation(tenantSlug, next, carried);

  useEffect(() => {
    const challenge = loadChallenge();
    setState(challenge ? { status: "ready", challenge } : { status: "missing" });
  }, []);

  // The temp token has a short life: surface expiry instead of failing on submit.
  useEffect(() => {
    if (state.status !== "ready") return;
    const left = state.challenge.expiresAt - Date.now();
    const timer = setTimeout(() => {
      clearChallenge();
      setState({ status: "missing" });
    }, Math.max(0, left));
    return () => clearTimeout(timer);
  }, [state]);

  const attempt = useCallback(
    async (action: (tempToken: string) => Promise<void>): Promise<void> => {
      if (state.status !== "ready") return;
      setPending(true);
      setFailure(null);
      try {
        await action(state.challenge.tempToken);
      } catch (error) {
        setFailure(describeFailure(error));
      } finally {
        setPending(false);
      }
    },
    [state],
  );

  const submit = useCallback(
    (mode: CodeMode, code: string): Promise<void> =>
      attempt(async (tempToken) => {
        const outcome =
          mode === "backup"
            ? await api.verifyBackup(tempToken, code)
            : await api.completeMfa(mode === "email" ? { tempToken, method: "email", code } : { tempToken, method: "totp", code });
        clearChallenge();
        proceed(outcome);
      }),
    [api, attempt, proceed],
  );

  const sendEmailCode = useCallback(
    (): Promise<void> =>
      attempt(async (tempToken) => {
        await api.mfaEmailOtp(tempToken);
        setEmailSent(true);
      }),
    [api, attempt],
  );

  const usePasskey = useCallback(
    (): Promise<void> =>
      attempt(async (tempToken) => {
        const start = await api.mfaWebAuthnStart(tempToken);
        const input = await runMfaPasskey(tempToken, start);
        const outcome = await api.completeMfa(input);
        clearChallenge();
        proceed(outcome);
      }),
    [api, attempt, proceed],
  );

  const restart = useCallback((): void => {
    clearChallenge();
    setState({ status: "missing" });
  }, []);

  return { state, pending, failure, emailSent, submit, sendEmailCode, usePasskey, restart };
}
