"use client";

import { useCallback, useEffect, useState } from "react";
import type { TotpSetup } from "@scrolloop/sdk";
import type { EnrollStep } from "../model/enroll";
import { describeFailure, type Failure } from "../model/failure";
import { useAuthApi } from "./use-auth-api";

export type EnrollSession = "checking" | "signed-in" | "signed-out";

/**
 * TOTP enrollment against the authenticated /mfa/* endpoints.
 * TODO(gap:Pre-session MFA enrollment): users who arrive with only an enrollment token
 * (policy-forced) have no session yet, so they land in "signed-out" until the backend accepts
 * the token on dedicated enrollment endpoints.
 */
export function useMfaEnroll() {
  const { api, tenantSlug } = useAuthApi();
  const [session, setSession] = useState<EnrollSession>("checking");
  const [step, setStep] = useState<EnrollStep>("intro");
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let live = true;
    api
      .mfaStatus()
      .then((status) => {
        if (!live) return;
        setSession("signed-in");
        if (status.enabled) setStep("done");
      })
      .catch(() => live && setSession("signed-out"));
    return () => {
      live = false;
    };
  }, [api]);

  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setPending(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure(describeFailure(error));
    } finally {
      setPending(false);
    }
  }, []);

  const start = (): Promise<void> =>
    run(async () => {
      setSetup(await api.setupTotp());
      setStep("setup");
    });

  const confirm = (code: string): Promise<void> =>
    run(async () => {
      const result = await api.confirmTotp(code);
      setCodes(result.backupCodes);
      setSetup(null);
      setStep("recovery");
    });

  const acknowledgeCodes = (): void => {
    setCodes([]);
    setStep("done");
  };

  return { session, step, setup, codes, pending, failure, tenantSlug, start, confirm, acknowledgeCodes };
}
