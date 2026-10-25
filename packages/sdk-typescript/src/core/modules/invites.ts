/**
 * Invitation links. Acceptance creates the account but does NOT sign the user
 * in (no cookies are set); the UI must send them to sign-in afterwards.
 */

import type {
  AcceptInviteRequest,
  AcceptInviteResult,
  InvitePreview,
  InviteRequestNewResult,
} from "../api-types";
import { call, enc, type ModuleContext } from "./context";

export interface InvitesModule {
  preview(token: string): Promise<InvitePreview>;
  accept(request: AcceptInviteRequest): Promise<AcceptInviteResult>;
  /** Expired/used invitee link: ask for a fresh invitation to the original address. */
  requestNew(token: string): Promise<InviteRequestNewResult>;
}

export function createInvitesModule(ctx: ModuleContext): InvitesModule {
  return {
    preview: (token) =>
      call<InvitePreview>(
        ctx,
        { url: `${ctx.baseURL}/auth/invite/validate/${enc(token)}`, method: "GET" },
        { auth: false },
      ),
    accept: (request) =>
      call<AcceptInviteResult>(
        ctx,
        { url: `${ctx.baseURL}/auth/invite/accept`, method: "POST", body: request },
        { auth: false },
      ),
    requestNew: (token) =>
      call<InviteRequestNewResult>(
        ctx,
        { url: `${ctx.baseURL}/auth/invite/request-new`, method: "POST", body: { token } },
        { auth: false },
      ),
  };
}
