/**
 * Invitation links. Acceptance creates the account but does NOT sign the user
 * in (no cookies are set); the UI must send them to sign-in afterwards.
 */

import type { AcceptInviteRequest, InvitePreview, MessageResult } from "../api-types";
import { call, enc, type ModuleContext } from "./context";

export interface InvitesModule {
  preview(token: string): Promise<InvitePreview>;
  accept(request: AcceptInviteRequest): Promise<MessageResult>;
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
      call<MessageResult>(
        ctx,
        { url: `${ctx.baseURL}/auth/invite/accept`, method: "POST", body: request },
        { auth: false },
      ),
  };
}
