"use client";

import { useCallback, useEffect, useState } from "react";
import { isConfirmedOnOtherDevice } from "@scrolloop/sdk";
import { afterWrongCode, failedLanding, type MagicLanding } from "../model/magic-landing";
import { isPlausibleToken } from "../model/link";
import { useAuthApi } from "./use-auth-api";
import { useContinuation } from "./use-continuation";

const codeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;

/**
 * Emailed sign-in link. Loading the page only PREVIEWS the link (read-only, scanner-safe);
 * the link is spent only by `signInHere` or `approveElsewhere`, both user actions.
 */
export function useMagicLanding(token: string | null, next: string | null) {
  const { api, tenantSlug } = useAuthApi();
  const proceed = useContinuation(tenantSlug, next);
  const [state, setState] = useState<MagicLanding>({ phase: "previewing" });

  useEffect(() => {
    if (!isPlausibleToken(token)) {
      setState(failedLanding(undefined));
      return;
    }
    let live = true;
    api
      .previewMagicLink(token)
      .then((preview) => live && setState({ phase: "ready", preview, attempts: 0, codeError: false, entering: false }))
      .catch((error: unknown) => live && setState(failedLanding(codeOf(error))));
    return () => {
      live = false;
    };
  }, [api, token]);

  const startEntering = useCallback((): void => {
    setState((s) => (s.phase === "ready" ? { ...s, entering: true, codeError: false } : s));
  }, []);

  const cancelEntering = useCallback((): void => {
    setState((s) => (s.phase === "ready" ? { ...s, entering: false, codeError: false } : s));
  }, []);

  /** Ordinary sign-in on this device. Also voids any pending request on the other device. */
  const signInHere = useCallback(async (): Promise<void> => {
    if (state.phase !== "ready" || !token) return;
    setState({ phase: "working", preview: state.preview, attempts: state.attempts, entering: false });
    try {
      const outcome = await api.verifyMagicLink(token, undefined);
      if (isConfirmedOnOtherDevice(outcome)) setState({ phase: "approved" });
      else proceed(outcome);
    } catch (error) {
      setState(failedLanding(codeOf(error)));
    }
  }, [api, proceed, state, token]);

  /** Approve the sign-in on the device that requested it, with the code shown there. */
  const approveElsewhere = useCallback(
    async (matchCode: string): Promise<void> => {
      if (state.phase !== "ready" || !token) return;
      const working = { phase: "working", preview: state.preview, attempts: state.attempts, entering: true } as const;
      setState(working);
      try {
        const outcome = await api.verifyMagicLink(token, matchCode);
        if (isConfirmedOnOtherDevice(outcome)) setState({ phase: "approved" });
        else proceed(outcome);
      } catch (error) {
        if (codeOf(error) === "AUTH_OTP_INVALID") setState(afterWrongCode(working));
        else setState(failedLanding(codeOf(error)));
      }
    },
    [api, proceed, state, token],
  );

  return { state, tenantSlug, startEntering, cancelEntering, signInHere, approveElsewhere };
}
