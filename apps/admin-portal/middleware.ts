import { NextRequest, NextResponse } from 'next/server'

const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? 'http://localhost:4000'

const INITIALIZED_COOKIE = 'sentry-initialized'
const INITIALIZED_TTL_SECONDS = 300 // 5 minutes
const UNINITIALIZED_TTL_SECONDS = 30 // 30 seconds — re-check quickly

// Pure helpers — no SDK imports (middleware runs on Edge runtime)

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
  } catch {
    return null
  }
}

function getAccessTokenFromRequest(request: NextRequest): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  // TODO: The access token is stored in module memory (not in any readable cookie).
  // Middleware cannot read it from the httpOnly refresh cookie.
  // Primary auth guard is the (admin)/layout.tsx server component which reads the
  // httpOnly cookie server-side and calls the auth service to verify the session.
  // This middleware provides a best-effort first-pass guard when a Bearer token
  // is present in the request headers.
  return null
}

/**
 * Fetch initialization status from the auth service.
 * Returns null on network error (fail open — let through, don't break the app).
 */
async function fetchIsInitialized(): Promise<boolean | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/superadmin/initialized`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // Edge runtime fetch; keep it tight
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { initialized: boolean }
    return body.initialized
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const hostname = host.split(':')[0]!

  // ── Phase 4: Subdomain routing ──────────────────────────────
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'sentry.scrolloop.com'

  if (hostname !== rootDomain && hostname.endsWith(`.${rootDomain}`)) {
    const slug = hostname.replace(`.${rootDomain}`, '')

    // Reserved subdomains for the superadmin portal
    if (slug === 'app' || slug === 'admin') {
      return NextResponse.next()
    }

    // Rewrite to /t/[slug]/... path internally
    const url = request.nextUrl.clone()
    url.pathname = `/t/${slug}${request.nextUrl.pathname}`
    return NextResponse.rewrite(url)
  }

  const { pathname } = request.nextUrl

  // ── First-run initialization check ────────────────────────────
  // Skip for the /setup page itself and public auth routes
  const isSetupPage = pathname === '/setup' || pathname.startsWith('/setup/')
  const isPublicRoute =
    isSetupPage ||
    pathname.startsWith('/u/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon')

  if (!isPublicRoute) {
    const cookieValue = request.cookies.get(INITIALIZED_COOKIE)?.value

    if (cookieValue === '0') {
      // Cached: not initialized → redirect to setup
      return NextResponse.redirect(new URL('/setup', request.url))
    }

    if (cookieValue !== '1') {
      // Cookie absent or stale — fetch from API
      const initialized = await fetchIsInitialized()

      if (initialized === false) {
        const redirectResponse = NextResponse.redirect(
          new URL('/setup', request.url),
        )
        redirectResponse.cookies.set(INITIALIZED_COOKIE, '0', {
          maxAge: UNINITIALIZED_TTL_SECONDS,
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
        })
        return redirectResponse
      }

      if (initialized === true) {
        // Mark as initialized in cookie; continue with normal auth checks below
        const response = NextResponse.next()
        response.cookies.set(INITIALIZED_COOKIE, '1', {
          maxAge: INITIALIZED_TTL_SECONDS,
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
        })
        return response
      }

      // initialized === null → network error, fail open (continue)
    }
  }

  const accessToken = getAccessTokenFromRequest(request)

  // ── Superadmin routes ──────────────────────────────────────
  const isSuperAdminRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/tenants') ||
    pathname.startsWith('/users') ||
    pathname.startsWith('/audit-logs') ||
    (pathname.startsWith('/settings') && !pathname.startsWith('/t/'))

  if (isSuperAdminRoute) {
    if (!accessToken) {
      // No token in header — let the server layout component do the full check.
      // We cannot read the httpOnly cookie here, so we pass through and rely on
      // the (admin)/layout.tsx server component guard for enforcement.
      return NextResponse.next()
    }

    const claims = parseJwtPayload(accessToken)
    if (!claims) {
      return NextResponse.redirect(new URL('/u/login', request.url))
    }

    const sentryTenantId = process.env.SENTRY_TENANT_ID
    const tenantOk = sentryTenantId
      ? claims.tenantId === sentryTenantId
      : claims.tenantSlug === 'sentry'
    const groupOk = Array.isArray(claims.groups) && claims.groups.includes('sentry-internal')

    if (!tenantOk || !groupOk) {
      const slug = claims.tenantSlug ?? ''
      return NextResponse.redirect(new URL(`/t/${slug}/dashboard`, request.url))
    }
  }

  // ── Tenant routes (/t/[slug]/...) ─────────────────────────
  const tenantMatch = pathname.match(/^\/t\/([^/]+)/)
  if (tenantMatch) {
    const slugFromUrl = tenantMatch[1]!

    if (!accessToken) {
      // Let the tenant layout handle the full server-side check
      return NextResponse.next()
    }

    const claims = parseJwtPayload(accessToken)
    if (!claims) {
      return NextResponse.redirect(new URL('/u/login', request.url))
    }

    if (claims.tenantSlug && claims.tenantSlug !== slugFromUrl) {
      return NextResponse.redirect(
        new URL(`/t/${claims.tenantSlug}/dashboard`, request.url)
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/tenants/:path*',
    '/users/:path*',
    '/audit-logs/:path*',
    '/settings/:path*',
    '/t/:path*',
  ],
}
