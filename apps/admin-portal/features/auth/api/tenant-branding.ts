import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";

export interface PublicTenantBranding {
  primaryColor?: string;
  logoUrl?: string;
}

const fetchBranding = withErrorHandler<[string], PublicTenantBranding | null>(
  async (slug: string) =>
    authClient.request({
      url: `${process.env.AUTH_SERVICE_URL}/tenants/${encodeURIComponent(slug)}/branding/public`,
      method: "GET",
    }),
  // Runs in a server component: never toast, and a failure just means "no branding".
  { showErrorToast: false },
);

/** Public (unauthenticated) tenant branding; null when unavailable. */
export async function getPublicTenantBranding(slug: string): Promise<PublicTenantBranding | null> {
  try {
    return (await fetchBranding(slug)) ?? null;
  } catch {
    return null;
  }
}
