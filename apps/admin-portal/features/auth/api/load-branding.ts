import { headers } from "next/headers";
import { tenantSlugFromHost } from "../model/tenant";
import { getPublicTenantBranding, type PublicTenantBranding } from "./tenant-branding";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "sentry.scrolloop.com";

/** Server-side: public branding for the tenant named by the request host, else null. */
export async function loadBranding(): Promise<PublicTenantBranding | null> {
  const host = (await headers()).get("host") ?? "";
  const slug = tenantSlugFromHost(host, ROOT_DOMAIN) ?? tenantSlugFromHost(host, "localhost");
  return slug ? getPublicTenantBranding(slug) : null;
}
