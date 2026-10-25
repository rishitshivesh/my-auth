"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  consumeIntent, REAUTH_DONE_PARAM, reauthUrl, saveIntent, type RecentAuthIntent,
} from "@/lib/recent-auth";

/**
 * Return-flow for actions that need a fresh sign-in. `requestReauth(action)`
 * remembers where to come back to and sends the user to sign in; on return,
 * `resumedAction` names the action to resume (caller re-confirms, never auto-runs).
 */
export function useRecentAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [resumed, setResumed] = useState<RecentAuthIntent | null>(null);

  useEffect(() => {
    if (params.get(REAUTH_DONE_PARAM) !== "done") return;
    setResumed(consumeIntent(window.sessionStorage, Date.now()));
  }, [params]);

  const requestReauth = useCallback(
    (action: string) => {
      const returnTo = `${pathname}?${REAUTH_DONE_PARAM}=done`;
      saveIntent(window.sessionStorage, { returnTo, action, createdAt: Date.now() });
      router.push(reauthUrl(returnTo));
    },
    [pathname, router],
  );

  return { requestReauth, resumedAction: resumed?.action ?? null } as const;
}
