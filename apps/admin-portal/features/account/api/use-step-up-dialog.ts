"use client";

import { useCallback, useState } from "react";
import type { ReauthRequirements } from "@scrolloop/sdk";
import { describeError } from "@/lib/api-error";
import {
  buildReauthInput,
  stepUpIssue,
  stepUpModes,
  stepUpErrorKind,
  type StepUpErrorKind,
  type StepUpMode,
} from "../model/step-up";
import { accountApi } from "./account-api";

export type StepUpPhase = "closed" | "loading" | "form" | "failed-load";

export interface StepUpFailure {
  kind: StepUpErrorKind;
  message: string;
}

/**
 * Real step-up on the current session. `open(action)` loads the user's factors, the dialog
 * collects the right proof, and `onVerified` fires only after the server accepted it. A failed
 * attempt keeps the dialog (and whatever sat behind it) exactly as it was.
 */
export function useStepUpDialog(onVerified: (action: string) => void) {
  const [phase, setPhase] = useState<StepUpPhase>("closed");
  const [action, setAction] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<ReauthRequirements | null>(null);
  const [mode, setMode] = useState<StepUpMode>("password");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<StepUpFailure | null>(null);

  const open = useCallback(async (next: string): Promise<void> => {
    setAction(next);
    setFailure(null);
    setPhase("loading");
    try {
      const req = await accountApi.reauthRequirements();
      setRequirements(req);
      setMode(stepUpModes(req).initial);
      setPhase("form");
    } catch {
      setPhase("failed-load");
    }
  }, []);

  const close = useCallback((): void => {
    setPhase("closed");
    setAction(null);
    setFailure(null);
  }, []);

  const fail = (error: unknown): void => setFailure({ kind: stepUpErrorKind(error), message: describeError(error).message });

  const finish = (): void => {
    const done = action;
    close();
    if (done) onVerified(done);
  };

  const submit = useCallback(
    async (password: string, code: string): Promise<void> => {
      if (mode === "passkey" || mode === "unsupported" || stepUpIssue(mode, password, code)) return;
      setPending(true);
      setFailure(null);
      try {
        await accountApi.reauthenticate(buildReauthInput(mode, password, code));
        finish();
      } catch (error) {
        fail(error);
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, action],
  );

  const usePasskey = useCallback(async (): Promise<void> => {
    setPending(true);
    setFailure(null);
    try {
      await accountApi.reauthenticateWithPasskey();
      finish();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return { phase, requirements, mode, setMode, pending, failure, open, close, submit, usePasskey };
}
