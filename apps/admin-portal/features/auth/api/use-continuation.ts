"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AuthOutcome } from "@scrolloop/sdk";
import { authRoutes } from "@/constants/routes";
import { classifyOutcome } from "../model/outcome";
import { createChallenge } from "../model/challenge";
import { saveChallenge } from "./challenge-store";
import { destinationDefaults } from "./tenant-client";
import { useDestination } from "./use-destination";

/** Handles every AuthOutcome branch: session, MFA challenge, enrollment required. */
export function useContinuation(tenantSlug: string, next: string | null) {
  const router = useRouter();
  const { follow } = useDestination();

  return useCallback(
    (outcome: AuthOutcome): void => {
      const continuation = classifyOutcome(
        outcome,
        next,
        tenantSlug,
        { origin: window.location.origin, ...destinationDefaults },
      );
      switch (continuation.kind) {
        case "session":
          follow(continuation.destination);
          return;
        case "mfa":
          saveChallenge(
            createChallenge(
              {
                tempToken: continuation.tempToken,
                methods: continuation.methods,
                preferred: continuation.preferred,
                remainingAttempts: continuation.remainingAttempts,
                next: next ?? undefined,
              },
              Date.now(),
            ),
          );
          router.replace(authRoutes.mfa());
          return;
        case "enroll":
          router.replace(authRoutes.mfaEnroll());
          return;
      }
    },
    [follow, next, router, tenantSlug],
  );
}
