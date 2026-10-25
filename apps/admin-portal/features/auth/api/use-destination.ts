"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { destinationDefaults } from "./tenant-client";
import { resolveDestination, type Destination } from "../model/destination";

/** Validates and follows destinations: relative via the router, external via full navigation. */
export function useDestination() {
  const router = useRouter();

  const resolve = useCallback((raw: string | null | undefined): Destination | null => {
    if (typeof window === "undefined") return null;
    return resolveDestination(raw, { origin: window.location.origin, ...destinationDefaults });
  }, []);

  const follow = useCallback(
    (destination: Destination): void => {
      if (destination.isExternal) window.location.assign(destination.href);
      else router.replace(destination.href);
    },
    [router],
  );

  return { resolve, follow };
}
