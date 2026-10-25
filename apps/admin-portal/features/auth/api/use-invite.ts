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
  | { status: "accepted"; invite: InvitePreview };

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

export function useInvite(token: string) {
  const { api } = useAuthApi();
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

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
        await api.inviteAccept({ token, name, password });
        setState({ status: "accepted", invite: state.invite });
      } catch (error) {
        setFailure(describeFailure(error));
      } finally {
        setPending(false);
      }
    },
    [api, state, token],
  );

  return { state, pending, failure, accept };
}
