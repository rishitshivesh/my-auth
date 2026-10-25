/**
 * OAuth 2.0 / OIDC authorization-code consent (/oauth/authorize, /oauth/consent).
 * The portal is just another relying UI: it builds the authorize URL, renders
 * the consent screen from getDetails(), and navigates to `redirect_to`.
 */

import type {
  AuthorizeParams,
  ConsentDecision,
  ConsentDetails,
  ConsentResult,
} from "../api-types";
import { call, enc, type ModuleContext } from "./context";

export interface ConsentModule {
  /** URL to navigate the browser to; the server redirects to login/consent as needed. */
  buildAuthorizeUrl(params: AuthorizeParams): string;
  getDetails(transactionId: string): Promise<ConsentDetails>;
  decide(decision: ConsentDecision): Promise<ConsentResult>;
}

export function createConsentModule(ctx: ModuleContext): ConsentModule {
  return {
    buildAuthorizeUrl(params) {
      const query = new URLSearchParams({ response_type: "code" });
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.set(key, String(value));
      }
      return `${ctx.baseURL}/oauth/authorize?${query.toString()}`;
    },

    getDetails: (transactionId) =>
      call<ConsentDetails>(ctx, {
        url: `${ctx.baseURL}/oauth/consent/${enc(transactionId)}`,
        method: "GET",
      }),

    decide: (decision) =>
      call<ConsentResult>(ctx, {
        url: `${ctx.baseURL}/oauth/consent`,
        method: "POST",
        body: {
          transaction_id: decision.transactionId,
          csrf_token: decision.csrfToken,
          decision: decision.decision,
          remember: decision.remember,
        },
      }),
  };
}
