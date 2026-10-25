// Server Component — fetches tenant branding before HTML is sent to browser
import { headers } from 'next/headers';
import { LoginForm } from './login-form';
import { getPublicTenantBranding } from '@/features/auth/api/tenant-branding';

function extractTenantSlug(hostname: string): string | null {
  const match = hostname.match(/^([^.]+)\.(sentry\.scrolloop\.com|localhost)/);
  return match?.[1] ?? null;
}

export default async function LoginPage() {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? '';
  const slug = extractTenantSlug(hostname);
  const branding = slug ? await getPublicTenantBranding(slug) : null;

  return (
    <LoginForm
      tenantSlug={slug ?? undefined}
      tenantLogo={branding?.logoUrl}
      primaryColor={branding?.primaryColor}
    />
  );
}
