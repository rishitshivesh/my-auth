"use client";

import { useCallback, useEffect, useState } from "react";
import { describeFailure, type Failure } from "../model/failure";
import { isPlausibleToken } from "../model/link";
import { failedLanding, type LandingFailure } from "../model/magic-landing";
import { destinationDefaults } from "./tenant-client";
import { resolveServerDestination, type Destination } from "../model/destination";
import { useAuthApi } from "./use-auth-api";

export type ResetLinkState =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "done"; destination: Destination | null }
  | { status: "failed"; reason: LandingFailure };

const codeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;

const failReason = (code: string | undefined): LandingFailure => {
  const landing = failedLanding(code);
  return landing.phase === "failed" ? landing.status : "invalid";
};

/**
 * Reset by emailed link. Loading validates read-only (a scanner cannot spend it); only the
 * password submission consumes the link.
 */
export function useResetLink(token: string) {
  const { api } = useAuthApi();
  const [state, setState] = useState<ResetLinkState>({ status: "checking" });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    if (!isPlausibleToken(token)) {
      setState({ status: "failed", reason: "invalid" });
      return;
    }
    let live = true;
    api
      .validateResetLink(token)
      .then((status) => live && setState(status.valid ? { status: "ready" } : { status: "failed", reason: "invalid" }))
      .catch((error: unknown) => live && setState({ status: "failed", reason: failReason(codeOf(error)) }));
    return () => {
      live = false;
    };
  }, [api, token]);

  const submit = useCallback(
    async (password: string): Promise<void> => {
      setPending(true);
      setFailure(null);
      try {
        const result = await api.resetWithToken(token, password);
        const destination =
          typeof window === "undefined"
            ? null
            : resolveServerDestination(result.redirectUri, { origin: window.location.origin, ...destinationDefaults });
        setState({ status: "done", destination });
      } catch (error) {
        const code = codeOf(error);
        if (code === "LINK_EXPIRED" || code === "LINK_ALREADY_USED" || code === "LINK_WRONG_ACCOUNT") {
          setState({ status: "failed", reason: failReason(code) });
        } else {
          setFailure(describeFailure(error));
        }
      } finally {
        setPending(false);
      }
    },
    [api, token],
  );

  return { state, pending, failure, submit };
}
