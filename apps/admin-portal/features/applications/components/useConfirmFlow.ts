"use client";

import { useCallback, useState } from "react";
import { describeError } from "@/lib/api-error";

export interface ConfirmFlow<T> {
  target: T | null;
  open: boolean;
  pending: boolean;
  /** Server error shown inside the dialog; the dialog stays open on failure. */
  error: string | undefined;
  request: (target: T) => void;
  cancel: () => void;
  confirm: () => Promise<void>;
}

/** State machine behind a ConfirmDialog: request, confirm (pending/error), cancel. */
export function useConfirmFlow<T>(action: (target: T) => Promise<unknown>, onDone?: (target: T) => void): ConfirmFlow<T> {
  const [target, setTarget] = useState<T | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const cancel = useCallback(() => {
    setTarget(null);
    setError(undefined);
  }, []);

  const confirm = useCallback(async () => {
    if (target === null) return;
    setPending(true);
    setError(undefined);
    try {
      await action(target);
      setTarget(null);
      onDone?.(target);
    } catch (failure: unknown) {
      setError(describeError(failure).message);
    } finally {
      setPending(false);
    }
  }, [action, onDone, target]);

  return { target, open: target !== null, pending, error, request: setTarget, cancel, confirm };
}
