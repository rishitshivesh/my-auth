"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvitePreview } from "@scrolloop/sdk";
import { describeFailure, type Failure } from "../model/failure";
import { failedPhase, isPlausibleToken, type LinkPhase } from "../model/link";
import { useAuthApi } from "./use-auth-api";

export type InviteState =
  | { status: "loading" }
  | { status: "ready"; invite: InvitePreview }
  | { status: "failed"; phase: Extract<LinkPhase, { phase: "failed" }> }
  | { status: "accepted"; invite: InvitePreview; canSignInNow: boolean };

/** Result of asking for a fresh invitation after the link expired. */
export type RenewalState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  | { status: "cooldown"; retryAfterSeconds?: number }
  | { status: "failed" };

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

export function useInvite(token: string) {
  const { api } = useAuthApi();
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [renewal, setRenewal] = useState<RenewalState>({ status: "idle" });

  // Validation is read-only (GET) and never consumes the invitation.
  useEffect(() => {
    if (!isPlausibleToken(token)) {
      setState({ status: "failed", phase: failedPhase(undefined) as Extract<LinkPhase, { phase: "failed" }> });
      return;
    }
    let live = true;
    api
      .invitePreview(token)
      .then((invite) => live && setState({ status: "ready", invite }))
      .catch((error: unknown) => live && setState({ status: "failed", phase: failedPhase(codeOf(error)) as Extract<LinkPhase, { phase: "failed" }> }));
    return () => {
      live = false;
    };
  }, [api, token]);

  const accept = useCallback(
    async (name: string, password: string): Promise<void> => {
      if (state.status !== "ready") return;
      setPending(true);
      setFailure(null);
      try {
        const result = await api.inviteAccept({ token, name, password });
        const canSignInNow = typeof result === "object" && result !== null && "canSignInNow" in result && result.canSignInNow === true;
        setState({ status: "accepted", invite: state.invite, canSignInNow });
      } catch (error) {
        setFailure(describeFailure(error));
      } finally {
        setPending(false);
      }
    },
    [api, state, token],
  );

  /** Expired link: mail a fresh invitation to the invited address (the server picks the address). */
  const requestNew = useCallback(async (): Promise<void> => {
    setRenewal({ status: "sending" });
    try {
      await api.inviteRequestNew(token);
      setRenewal({ status: "sent" });
    } catch (error) {
      const failed = describeFailure(error);
      if (codeOf(error) === "LINK_ALREADY_USED") {
        setState({ status: "failed", phase: failedPhase("LINK_ALREADY_USED") as Extract<LinkPhase, { phase: "failed" }> });
        setRenewal({ status: "idle" });
      } else if (failed.kind === "rate-limited") {
        setRenewal({ status: "cooldown", retryAfterSeconds: failed.retryAfterSeconds });
      } else {
        setRenewal({ status: "failed" });
      }
    }
  }, [api, token]);

  return { state, pending, failure, accept, renewal, requestNew };
}
