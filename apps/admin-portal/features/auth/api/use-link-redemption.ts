"use client";

import { useCallback, useState } from "react";
import { failedPhase, type LinkPhase } from "../model/link";

/**
 * Redeems an emailed token only when `redeem()` is called from a user action,
 * never on mount: mail scanners and prefetchers load the page but cannot click.
 */
export function useLinkRedemption<T>(action: (token: string) => Promise<T>) {
  const [phase, setPhase] = useState<LinkPhase>({ phase: "valid" });
  const [result, setResult] = useState<T | null>(null);

  const redeem = useCallback(
    async (token: string): Promise<T | null> => {
      setPhase({ phase: "redeeming" });
      try {
        const value = await action(token);
        setResult(value);
        setPhase({ phase: "done" });
        return value;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
        setPhase(failedPhase(code));
        return null;
      }
    },
    [action],
  );

  return { phase, result, redeem };
}
