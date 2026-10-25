"use client";

import { createContext, Suspense, useContext, useMemo, type ReactNode } from "react";
import { useRecentAuth } from "@/hooks/use-recent-auth";

interface StepUpState {
  requestReauth: (action: string) => void;
  resumedAction: string | null;
}

const StepUpContext = createContext<StepUpState | null>(null);

function Inner({ children }: { children: ReactNode }) {
  // One consumer for the whole page: the stored intent is single-use, so
  // sections must share it instead of each reading (and clearing) it.
  const { requestReauth, resumedAction } = useRecentAuth();
  const value = useMemo(() => ({ requestReauth, resumedAction }), [requestReauth, resumedAction]);
  return <StepUpContext.Provider value={value}>{children}</StepUpContext.Provider>;
}

/** Shares the recent-sign-in return flow with every section on an account page. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}

export function useStepUpContext(): StepUpState {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error("useStepUp must be used inside StepUpProvider");
  return ctx;
}
