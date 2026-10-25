"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { StepUpDialog } from "../components/StepUpDialog";
import { useStepUpDialog } from "./use-step-up-dialog";

interface StepUpState {
  requestReauth: (action: string) => void;
  resumedAction: string | null;
}

const StepUpContext = createContext<StepUpState | null>(null);

/**
 * Shares one step-up dialog with every section of an account page. Verifying keeps the user on the
 * page (drafts survive) and names the interrupted action so its view re-opens the confirmation;
 * the action itself is never re-run automatically.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [resumedAction, setResumedAction] = useState<string | null>(null);
  const dialog = useStepUpDialog(setResumedAction);
  const { open } = dialog;
  const requestReauth = useCallback((action: string) => {
    setResumedAction(null);
    void open(action);
  }, [open]);
  const value = useMemo(() => ({ requestReauth, resumedAction }), [requestReauth, resumedAction]);
  return (
    <StepUpContext.Provider value={value}>
      {children}
      <StepUpDialog
        phase={dialog.phase}
        requirements={dialog.requirements}
        mode={dialog.mode}
        pending={dialog.pending}
        failure={dialog.failure}
        onModeChange={dialog.setMode}
        onSubmit={(password, code) => void dialog.submit(password, code)}
        onPasskey={() => void dialog.usePasskey()}
        onClose={dialog.close}
      />
    </StepUpContext.Provider>
  );
}

export function useStepUpContext(): StepUpState {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error("useStepUp must be used inside StepUpProvider");
  return ctx;
}
