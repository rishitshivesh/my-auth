"use client";

import { useEffect, useRef, useState } from "react";
import { isMagicLinkPending, type AuthOutcome } from "@scrolloop/sdk";
import { nextPollDelay, pollFailurePhase, secondsLeft, type PollPhase } from "../model/magic-poll";
import type { AuthApi } from "./auth-api";

export interface MagicPollInput {
  pollingNonce: string;
  expiresInSeconds: number;
  /** Changes whenever a fresh link/nonce is issued, restarting the clock. */
  startedAt: number;
}

const codeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;

/**
 * Polls the requesting device's nonce with growing backoff until the link is approved elsewhere
 * (then hands the outcome on), the 409 "already used" arrives, or the link expires.
 */
export function useMagicPoll(
  api: AuthApi,
  input: MagicPollInput | null,
  onOutcome: (outcome: AuthOutcome) => void,
): { phase: PollPhase; remaining: number } {
  const [phase, setPhase] = useState<PollPhase>({ phase: "waiting" });
  const [remaining, setRemaining] = useState(input ? input.expiresInSeconds : 0);
  const outcomeRef = useRef(onOutcome);
  outcomeRef.current = onOutcome;

  useEffect(() => {
    if (!input) return;
    setPhase({ phase: "waiting" });
    setRemaining(secondsLeft(input.startedAt, input.expiresInSeconds, Date.now()));
    let live = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = setInterval(() => {
      if (!live) return;
      const left = secondsLeft(input.startedAt, input.expiresInSeconds, Date.now());
      setRemaining(left);
      if (left === 0) {
        live = false;
        clearTimeout(timer);
        setPhase({ phase: "expired" });
      }
    }, 1000);

    const poll = async (): Promise<void> => {
      if (!live) return;
      try {
        const result = await api.pollMagicLink(input.pollingNonce);
        if (!live) return;
        if (isMagicLinkPending(result)) {
          timer = setTimeout(() => void poll(), nextPollDelay(attempt++));
          return;
        }
        live = false;
        outcomeRef.current(result);
      } catch (error) {
        if (!live) return;
        live = false;
        setPhase(pollFailurePhase(codeOf(error)));
      }
    };
    timer = setTimeout(() => void poll(), nextPollDelay(attempt++));

    return () => {
      live = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [api, input]);

  return { phase, remaining };
}
