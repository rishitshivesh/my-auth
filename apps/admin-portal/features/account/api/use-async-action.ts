"use client";

import { useCallback, useRef, useState } from "react";
import { describeError } from "@/lib/api-error";

export interface AsyncAction<Args extends unknown[], R> {
  run: (...args: Args) => Promise<R | undefined>;
  pending: boolean;
  /** User-facing message of the last failure, if any. */
  error: string | undefined;
  /** The raw failure, for branching (recent-auth, passkey cancelled). */
  failure: unknown;
  clear: () => void;
}

/**
 * Runs a mutation without a cache: results (which may be one-time secrets) are
 * returned to the caller only and never retained here. Failures become state
 * instead of exceptions so views can render them inline.
 */
export function useAsyncAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>): AsyncAction<Args, R> {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(undefined);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: Args): Promise<R | undefined> => {
    setPending(true);
    setFailure(undefined);
    try {
      return await fnRef.current(...args);
    } catch (error: unknown) {
      setFailure(error ?? new Error("failed"));
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  const clear = useCallback(() => setFailure(undefined), []);
  const error = failure === undefined ? undefined : describeError(failure).message;
  return { run, pending, error, failure, clear };
}
