"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConsentDetails } from "@scrolloop/sdk";
import { consentLoadIssue, safeExternalUrl, type ConsentLoadIssue } from "../model/consent";
import { describeFailure, type Failure } from "../model/failure";
import { useAuthApi } from "./use-auth-api";

export type ConsentState =
  | { status: "loading" }
  | { status: "ready"; details: ConsentDetails; account: string | null }
  | { status: "issue"; issue: ConsentLoadIssue }
  | { status: "redirecting"; decision: "allow" | "deny" };

export function useConsent(transactionId: string | null) {
  const { api, tenantSlug } = useAuthApi();
  const [state, setState] = useState<ConsentState>(
    transactionId ? { status: "loading" } : { status: "issue", issue: "invalid" },
  );
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    let live = true;
    (async () => {
      try {
        const details = await api.consentDetails(transactionId);
        const account = await api.profileEmail().catch(() => null);
        if (live) setState({ status: "ready", details, account });
      } catch (error) {
        if (live) setState({ status: "issue", issue: consentLoadIssue(error) });
      }
    })();
    return () => {
      live = false;
    };
  }, [api, transactionId]);

  const decide = useCallback(
    async (decision: "allow" | "deny", remember: boolean): Promise<void> => {
      if (state.status !== "ready") return;
      setPending(true);
      setFailure(null);
      try {
        const result = await api.consentDecide({
          transactionId: state.details.transaction_id,
          csrfToken: state.details.csrf_token,
          decision,
          remember: decision === "allow" ? remember : undefined,
        });
        const target = safeExternalUrl(result.redirect_to);
        if (!target) throw new Error("Invalid redirect");
        setState({ status: "redirecting", decision });
        window.location.assign(target);
      } catch (error) {
        setFailure(describeFailure(error));
        setPending(false);
      }
    },
    [api, state],
  );

  return { state, pending, failure, decide, tenantSlug };
}
