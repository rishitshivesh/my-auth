// Server Component — fetches tenant branding before HTML is sent to browser
import { headers } from 'next/headers';
import { LoginForm } from './login-form';
import { BrandPanel } from './brand-panel';

interface TenantBranding {
  primaryColor?: string;
  logoUrl?: string;
  fontFamily?: string;
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
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '3fr 2fr' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <LoginForm tenantSlug={slug ?? undefined} tenantLogo={branding?.logoUrl} />
      </div>
      <BrandPanel primaryColor={branding?.primaryColor} />
    </main>
  );
}
