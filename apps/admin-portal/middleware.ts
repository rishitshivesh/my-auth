import { NextRequest, NextResponse } from 'next/server'

const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? 'http://localhost:4000'

const INITIALIZED_COOKIE = 'sentry-initialized'
const PLATFORM_SLUG_COOKIE = 'sentry-platform-slug'
const INITIALIZED_TTL_S = 3600  // 1 hour — reduce API calls once initialized
const UNINITIALIZED_TTL_S = 30  // 30 s — re-check quickly while bootstrapping

interface PlatformInfo {
  slug: string
  name: string
  initialized: boolean
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
  } catch {
    return null
  }
}

function getAccessToken(request: NextRequest): string | null {
  // Tokens are httpOnly cookies — not accessible here; read from cookie jar
  return request.cookies.get('accessToken')?.value ?? null
}

async function fetchPlatformInfo(): Promise<PlatformInfo | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/superadmin/platform-info`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    return (await res.json())?.data as PlatformInfo
  } catch {
    return null
  }
}

async function resolvePlatformInfo(
  request: NextRequest,
): Promise<{ info: PlatformInfo | null; fromCache: boolean }> {
  const cachedInit = request.cookies.get(INITIALIZED_COOKIE)?.value
  const cachedSlug = request.cookies.get(PLATFORM_SLUG_COOKIE)?.value ?? 'sentry'

  if (cachedInit === '1') {
    return { info: { slug: cachedSlug, name: '', initialized: true }, fromCache: true }
  }
  if (cachedInit === '0') {
    return { info: { slug: cachedSlug, name: '', initialized: false }, fromCache: true }
  }

  const info = await fetchPlatformInfo()
  return { info, fromCache: false }
}

function setCookies(
  response: NextResponse,
  initialized: boolean,
  slug: string,
): void {
  const ttl = initialized ? INITIALIZED_TTL_S : UNINITIALIZED_TTL_S
  response.cookies.set(INITIALIZED_COOKIE, initialized ? '1' : '0', {
    maxAge: ttl,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  })
  response.cookies.set(PLATFORM_SLUG_COOKIE, slug, {
    maxAge: INITIALIZED_TTL_S,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  })
}

/**
 * Routes that exist as-is on every host, including tenant subdomains: hosted identity, the
 * console (which already carries /t/{slug}) and the personal account. Rewriting them to
 * /t/{slug}/... would yield 404s (e.g. /t/acme/u/login or /t/acme/t/acme/dashboard).
 */
const HOST_INDEPENDENT_PREFIXES = [
  '/u/', '/t/', '/invite/', '/mfa/', '/dashboard', '/onboarding', '/verify-email', '/reset-password', '/error', '/setup',
]

function isHostIndependent(pathname: string): boolean {
  return HOST_INDEPENDENT_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const hostname = host.split(':')[0]!
  const { pathname } = request.nextUrl

  // ── Subdomain routing ──────────────────────────────────────────
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'sentry.scrolloop.com'
  if (hostname !== rootDomain && hostname.endsWith(`.${rootDomain}`)) {
    const slug = hostname.replace(`.${rootDomain}`, '')
    if (slug === 'app' || slug === 'admin') return NextResponse.next()
    if (!isHostIndependent(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = `/t/${slug}${request.nextUrl.pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // ── Always-pass-through paths ──────────────────────────────────
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/error')
  ) {
    return NextResponse.next()
  }

  const isSetupPage = pathname === '/setup' || pathname.startsWith('/setup/')

  // ── /setup gate ────────────────────────────────────────────────
  // Always fresh-fetches so a revisit after setup completes redirects away.
  if (isSetupPage) {
    const info = await fetchPlatformInfo()

    if (info === null) {
      // Auth service unreachable — show error page rather than the setup form
      const url = request.nextUrl.clone()
      url.pathname = '/error'
      url.search = '?reason=api_unavailable'
      return NextResponse.redirect(url)
    }

    if (info.initialized) {
      const res = NextResponse.redirect(new URL('/u/login', request.url))
      setCookies(res, true, info.slug)
      return res
    }

    // Not yet initialized — let the setup page render
    return NextResponse.next()
  }

  // ── Self-service flows: always accessible ──────────────────────
  if (
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname.startsWith('/invite/')
  ) {
    return NextResponse.next()
  }

  // ── Initialization guard for all other routes ──────────────────
  const { info, fromCache } = await resolvePlatformInfo(request)

  if (info === null) {
    // Auth service unreachable — fail-closed to error page
    const url = request.nextUrl.clone()
    url.pathname = '/error'
    url.search = '?reason=api_unavailable'
    return NextResponse.redirect(url)
  }

  if (!info.initialized) {
    const res = NextResponse.redirect(new URL('/setup', request.url))
    setCookies(res, false, info.slug)
    return res
  }

  if (!fromCache) {
    // Cache the platform info for subsequent requests
    const res = NextResponse.next()
    setCookies(res, true, info.slug)
    return res
  }

  // ── Auth checks ────────────────────────────────────────────────
  const accessToken = getAccessToken(request)

  const platformSlug = request.cookies.get(PLATFORM_SLUG_COOKIE)?.value
    ?? process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG
    ?? 'sentry'

  const isSuperAdminRoute =
    pathname === '/dashboard' ||
    pathname.startsWith('/tenants') ||
    pathname.startsWith('/users') ||
    pathname.startsWith('/audit-logs') ||
    (pathname.startsWith('/settings') && !pathname.startsWith('/t/'))

  if (isSuperAdminRoute) {
    if (!accessToken) return NextResponse.redirect(new URL('/u/login', request.url))
    const claims = parseJwtPayload(accessToken)
    if (!claims) return NextResponse.redirect(new URL('/u/login', request.url))
    const groupOk = Array.isArray(claims.groups) && claims.groups.includes(`${platformSlug}-internal`)
    if (!groupOk) {
      const slug = (claims.tenantSlug as string) ?? platformSlug
      return NextResponse.redirect(new URL(`/t/${slug}/dashboard`, request.url))
    }
  }

  const tenantMatch = pathname.match(/^\/t\/([^/]+)/)
  if (tenantMatch) {
    const slugFromUrl = tenantMatch[1]!
    if (!accessToken) return NextResponse.next()
    const claims = parseJwtPayload(accessToken)
    if (!claims) return NextResponse.redirect(new URL('/u/login', request.url))
    if (claims.tenantSlug && claims.tenantSlug !== slugFromUrl) {
      return NextResponse.redirect(
        new URL(`/t/${claims.tenantSlug}/dashboard`, request.url),
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
