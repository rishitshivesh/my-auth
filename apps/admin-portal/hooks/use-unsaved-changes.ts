"use client";

import { useEffect, useMemo } from "react";
import { isDirty } from "@/lib/unsaved-changes";

/** Warns on tab close/reload while `current` differs from `initial`. Returns the dirty flag. */
export function useUnsavedChanges<T>(initial: T, current: T): boolean {
  const dirty = useMemo(() => isDirty(initial, current), [initial, current]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return dirty;
}
