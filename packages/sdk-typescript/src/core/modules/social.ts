/** Social login and account linking. Browser redirects are kept out of fetch. */

import type { SocialConnection } from "../api-types";
import { AuthError } from "../types";
import { call, callVoid, enc, type ModuleContext } from "./context";

export interface SocialModule {
  /** URL that starts a social login for this tenant. */
  loginUrl(provider: string, returnUrl?: string): string;
  /** Navigate the browser to the provider (browser only). */
  login(provider: string): void;
  listConnections(): Promise<SocialConnection[]>;
  unlink(provider: string): Promise<void>;
  /** Fetch a 60s link token, then navigate the browser to the provider (browser only). */
  startLinking(provider: string): Promise<void>;
}

export function createSocialModule(ctx: ModuleContext, tenant: string): SocialModule {
  const base = `${ctx.baseURL}/auth/social`;

  const loginUrl = (provider: string, returnUrl?: string): string => {
    const query = new URLSearchParams({ tenant_id: tenant });
    if (returnUrl) query.set("return_url", returnUrl);
    return `${base}/${enc(provider)}/login?${query.toString()}`;
  };

  const requireBrowser = (what: string): void => {
    if (typeof window === "undefined") {
      throw new AuthError("UNKNOWN_ERROR", `${what} is only available in browser environments`);
    }
  };

  return {
    loginUrl,

    login(provider) {
      requireBrowser("social login");
      window.location.href = loginUrl(provider, window.location.origin);
    },

    async listConnections() {
      const payload = await call<SocialConnection[] | { connections: SocialConnection[] }>(ctx, {
        url: `${base}/connections`,
        method: "GET",
      });
      if (Array.isArray(payload)) return payload;
      return Array.isArray(payload?.connections) ? payload.connections : [];
    },

    unlink: (provider) => callVoid(ctx, { url: `${base}/connections/${enc(provider)}`, method: "DELETE" }),

    async startLinking(provider) {
      requireBrowser("startLinking");
      const result = await call<{ linkToken?: string }>(ctx, { url: `${base}/link/token`, method: "POST" });
      if (!result?.linkToken) {
        throw new AuthError("UNKNOWN_ERROR", "No link token in response");
      }
      window.location.href = `${base}/link/${enc(provider)}?lt=${enc(result.linkToken)}`;
    },
  };
}
