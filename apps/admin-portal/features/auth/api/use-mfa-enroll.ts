"use client";

import { useCallback, useEffect, useState } from "react";
import type { TotpEnrollmentSetup } from "@scrolloop/sdk";
import type { EnrollStep } from "../model/enroll";
import { resolveDestination, resolveServerDestination, type Destination } from "../model/destination";
import { type StoredEnrollment } from "../model/enrollment";
import { describeFailure, type Failure } from "../model/failure";
import { defaultDashboard } from "../model/outcome";
import { clearEnrollment, loadEnrollment } from "./enrollment-store";
import { destinationDefaults } from "./tenant-client";
import { useAuthApi } from "./use-auth-api";
import { useDestination } from "./use-destination";

export type EnrollSession = "checking" | "ready" | "missing" | "expired";

/**
 * Pre-session TOTP enrollment (sign-in returned `mfa_enrollment_required`). Setup and confirm
 * accept the short-lived enrollment token (from sign-in, or the httpOnly cookie when the sign-in
 * method could not hand it over); confirming establishes the session and returns the recovery codes.
 */
export function useMfaEnroll() {
  const { api, tenantSlug } = useAuthApi();
  const { follow } = useDestination();
  const [session, setSession] = useState<EnrollSession>("checking");
  const [enrollment, setEnrollment] = useState<StoredEnrollment | null>(null);
  const [step, setStep] = useState<EnrollStep>("intro");
  const [setup, setSetup] = useState<TotpEnrollmentSetup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    const stored = loadEnrollment();
    setEnrollment(stored);
    setSession(stored ? "ready" : "missing");
  }, []);

  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setPending(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      const failed = describeFailure(error);
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code === "AUTH_TOKEN_EXPIRED" || code === "AUTH_TOKEN_INVALID" || code === "AUTH_UNAUTHORIZED") {
        clearEnrollment();
        setSession("expired");
      }
      setFailure(failed);
    } finally {
      setPending(false);
    }
  }, []);

  const start = (): Promise<void> =>
    run(async () => {
      setSetup(await api.enrollSetup(enrollment?.enrollmentToken));
      setStep("setup");
    });

  const confirm = (code: string): Promise<void> =>
    run(async () => {
      const result = await api.enrollConfirm(code, enrollment?.enrollmentToken);
      setCodes(result.backupCodes);
      setSetup(null);
      setStep("recovery");
    });

  const acknowledgeCodes = (): void => {
    setCodes([]);
    setStep("done");
  };

  /** Where "finish" goes: the validated destination carried through sign-in, else the dashboard. */
  const finish = (): void => {
    const ctx = { origin: window.location.origin, ...destinationDefaults };
    const destination: Destination =
      resolveServerDestination(enrollment?.redirectUri, ctx) ??
      resolveDestination(enrollment?.next, ctx) ?? { href: defaultDashboard(tenantSlug), isExternal: false };
    clearEnrollment();
    follow(destination);
  };

  return { session, step, setup, codes, pending, failure, tenantSlug, start, confirm, acknowledgeCodes, finish };
}
