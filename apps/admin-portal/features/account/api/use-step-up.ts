"use client";

import { useCallback } from "react";
import { useCopy } from "@/i18n";
import { isRecentAuthError } from "../model/errors";
import { useStepUpContext } from "./step-up-context";

/**
 * Recent-sign-in handling for one sensitive action.
 *
 * `recentAuthFor(failure)` derives the ConfirmDialog `recentAuth` prop from the last failure:
 * when the server answered ACCESS_RECENT_AUTH_REQUIRED the dialog offers "Sign in again",
 * which remembers `action` and returns to this page. `resumed` is true after coming back so
 * the view can re-open the confirmation (it never re-runs the action by itself).
 *
 * TODO(gap:Step-up / recent auth): there is no step-up endpoint, so re-authentication is a
 * full sign-in round trip through /u/login?reauth=1 and any in-progress draft is lost.
 */
export function useStepUp(action: string) {
  const { t } = useCopy();
  const { requestReauth, resumedAction } = useStepUpContext();
  const onReauthenticate = useCallback(() => requestReauth(action), [requestReauth, action]);

  const recentAuthFor = useCallback(
    (failure: unknown) => ({
      required: isRecentAuthError(failure),
      notice: t("account.security.reauthNotice"),
      actionLabel: t("account.security.reauthAction"),
      onReauthenticate,
    }),
    [t, onReauthenticate],
  );

  return { recentAuthFor, onReauthenticate, resumed: resumedAction === action } as const;
}
