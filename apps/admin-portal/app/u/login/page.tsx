// Server Component — fetches tenant branding before HTML is sent to browser
import { headers } from 'next/headers';
import { LoginForm } from './login-form';

interface TenantBranding {
  primaryColor?: string;
  logoUrl?: string;
}

async function getTenantBranding(slug: string): Promise<TenantBranding | null> {
  try {
    const res = await fetch(
      `${process.env.AUTH_SERVICE_URL}/tenants/${slug}/branding/public`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: TenantBranding };
    return json.data ?? null;
  } catch {
    return null;
  }
}

function extractTenantSlug(hostname: string): string | null {
  const match = hostname.match(/^([^.]+)\.(sentry\.scrolloop\.com|localhost)/);
  return match?.[1] ?? null;
}

export default async function LoginPage() {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? '';
  const slug = extractTenantSlug(hostname);
  const branding = slug ? await getTenantBranding(slug) : null;

  return (
    <LoginForm
      tenantSlug={slug ?? undefined}
      tenantLogo={branding?.logoUrl}
      primaryColor={branding?.primaryColor}
    />
  );
}
