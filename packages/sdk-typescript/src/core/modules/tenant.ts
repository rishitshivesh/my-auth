/** Workspace-level calls available to any signed-in or onboarding user. */

import type {
  OrgMembership,
  RegisterTenantRequest,
  RegisterTenantResult,
  SlugAvailability,
} from "../api-types";
import { call, type ModuleContext } from "./context";

export interface TenantModule {
  listMyOrgs(): Promise<OrgMembership[]>;
  checkSlug(slug: string): Promise<SlugAvailability>;
  /**
   * Self-service workspace creation. The server answers with tokens in the body
   * and sets no cookies, and the SDK deliberately drops them (ADR-0003): the
   * owner must sign in on the new tenant's host afterwards. See docs/ui-sdk-gaps.md.
   */
  register(request: RegisterTenantRequest): Promise<RegisterTenantResult>;
}

export function createTenantModule(ctx: ModuleContext): TenantModule {
  return {
    async listMyOrgs() {
      const orgs = await call<OrgMembership[]>(ctx, { url: `${ctx.baseURL}/users/orgs`, method: "GET" });
      return Array.isArray(orgs) ? orgs : [];
    },
    checkSlug: (slug) =>
      call<SlugAvailability>(
        ctx,
        { url: `${ctx.baseURL}/tenants/slug-check?slug=${encodeURIComponent(slug)}`, method: "GET" },
        { auth: false },
      ),
    register: (request) =>
      call<RegisterTenantResult>(
        ctx,
        { url: `${ctx.baseURL}/tenants/register`, method: "POST", body: request },
        { auth: false },
      ),
  };
}
