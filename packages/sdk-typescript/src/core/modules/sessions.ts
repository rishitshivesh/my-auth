/** Device/session management for the signed-in user (/sessions/*). */

import type { ActiveSession, RevokeSessionsResult } from "../api-types";
import { call, callVoid, enc, type ModuleContext } from "./context";

export interface SessionsModule {
  list(): Promise<ActiveSession[]>;
  revoke(sessionId: string): Promise<void>;
  /** Sign out every device except this one. */
  revokeOthers(): Promise<RevokeSessionsResult>;
  /** Sign out every device including this one; the local session is cleared. */
  revokeAll(): Promise<RevokeSessionsResult>;
}

export function createSessionsModule(ctx: ModuleContext): SessionsModule {
  const url = (path: string): string => `${ctx.baseURL}/sessions${path}`;
  return {
    list: () => call<ActiveSession[]>(ctx, { url: url("/active"), method: "GET" }),
    revoke: (sessionId) => callVoid(ctx, { url: url(`/${enc(sessionId)}`), method: "DELETE" }),
    revokeOthers: () => call<RevokeSessionsResult>(ctx, { url: url("/all/other"), method: "DELETE" }),
    async revokeAll() {
      const result = await call<RevokeSessionsResult>(ctx, { url: url("/all"), method: "DELETE" });
      ctx.endLocalSession();
      return result;
    },
  };
}
