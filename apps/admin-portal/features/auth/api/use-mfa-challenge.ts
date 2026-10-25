"use client";

import { useCallback, useEffect, useState } from "react";
import { describeFailure, type Failure } from "../model/failure";
import type { StoredChallenge } from "../model/challenge";
import { clearChallenge, loadChallenge } from "./challenge-store";
import { useAuthApi } from "./use-auth-api";
import { useContinuation } from "./use-continuation";

export type ChallengeState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; challenge: StoredChallenge };

export function useMfaChallenge() {
  const { api, tenantSlug } = useAuthApi();
  const [state, setState] = useState<ChallengeState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const next = state.status === "ready" ? state.challenge.next ?? null : null;
  const proceed = useContinuation(tenantSlug, next);

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

  const submit = useCallback(
    async (mode: "totp" | "backup", code: string): Promise<void> => {
      if (state.status !== "ready") return;
      setPending(true);
      setFailure(null);
      try {
        const { tempToken } = state.challenge;
        const outcome =
          mode === "totp" ? await api.verifyMfa(tempToken, code) : await api.verifyBackup(tempToken, code);
        clearChallenge();
        proceed(outcome);
      } catch (error) {
        setFailure(describeFailure(error));
      } finally {
        setPending(false);
      }
    },
    [api, proceed, state],
  );

  const restart = useCallback((): void => {
    clearChallenge();
    setState({ status: "missing" });
  }, []);

  return { state, pending, failure, submit, restart };
}
