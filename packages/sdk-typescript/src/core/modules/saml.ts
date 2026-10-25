/** SAML browser entry points. These are redirects, so the SDK only builds URLs. */

import { enc, type ModuleContext } from "./context";

export interface SamlModule {
  /** Where the IdP-initiated flow resumes after sign-in: navigate the browser here. */
  continueUrl(nonce: string): string;
  metadataUrl(tenantSlug: string): string;
}

export function createSamlModule(ctx: ModuleContext): SamlModule {
  return {
    continueUrl: (nonce) => `${ctx.baseURL}/saml/sso/continue/${enc(nonce)}`,
    metadataUrl: (tenantSlug) => `${ctx.baseURL}/saml/metadata/${enc(tenantSlug)}`,
  };
}
