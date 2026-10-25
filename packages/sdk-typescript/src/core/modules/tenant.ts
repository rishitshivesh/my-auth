/** Workspace-level calls available to any signed-in or onboarding user. */

import type {
  Branding,
  BrandingUpdate,
  OrgMembership,
  RegisterTenantRequest,
  RegisterTenantResult,
  SlugAvailability,
} from "../api-types";
import { call, enc, type ModuleContext } from "./context";

export interface TenantModule {
  listMyOrgs(): Promise<OrgMembership[]>;
  checkSlug(slug: string): Promise<SlugAvailability>;
  /**
   * Self-service workspace creation. The server sets the owner's auth cookies
   * and returns no tokens. Cookies are scoped to the API host: continue on the
   * new tenant's host (this client's local session state is not updated).
   */
  register(request: RegisterTenantRequest): Promise<RegisterTenantResult>;
  /** Current tenant's branding (admin). */
  getBranding(): Promise<Branding>;
  updateBranding(update: BrandingUpdate): Promise<Branding>;
  /** Public branding for a hosted login page, by tenant slug. */
  getPublicBranding(slug: string): Promise<Branding>;
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
    getBranding: () => call<Branding>(ctx, { url: `${ctx.baseURL}/tenants/current/branding`, method: "GET" }),
    updateBranding: (update) =>
      call<Branding>(ctx, { url: `${ctx.baseURL}/tenants/current/branding`, method: "PUT", body: update }),
    getPublicBranding: (slug) =>
      call<Branding>(
        ctx,
        { url: `${ctx.baseURL}/tenants/${enc(slug)}/branding/public`, method: "GET" },
        { auth: false },
      ),
  };
}
