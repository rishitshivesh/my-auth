import { NextRequest, NextResponse } from 'next/server'

const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? 'http://localhost:4000'

const INITIALIZED_COOKIE = 'sentry-initialized'
const INITIALIZED_TTL = 300   // 5 min — re-check after this
const UNINITIALIZED_TTL = 30  // 30 s — re-check quickly

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
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  return null
}

async function fetchIsInitialized(): Promise<boolean | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/superadmin/initialized`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { initialized: boolean }
    return body.initialized
  } catch {
    return null
  }
}

/** Read cached init status from cookie, or fetch fresh from API. */
async function resolveInitialized(
  request: NextRequest,
): Promise<{ status: boolean | null; fromCache: boolean }> {
  const cached = request.cookies.get(INITIALIZED_COOKIE)?.value
  if (cached === '1') return { status: true, fromCache: true }
  if (cached === '0') return { status: false, fromCache: true }
  const status = await fetchIsInitialized()
  return { status, fromCache: false }
}

function setInitCookie(
  response: NextResponse,
  value: '0' | '1',
): void {
  response.cookies.set(INITIALIZED_COOKIE, value, {
    maxAge: value === '1' ? INITIALIZED_TTL : UNINITIALIZED_TTL,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  })
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
    const url = request.nextUrl.clone()
    url.pathname = `/t/${slug}${request.nextUrl.pathname}`
    return NextResponse.rewrite(url)
  }

  // ── Always-pass-through paths ──────────────────────────────────
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next()
  }

  const isSetupPage = pathname === '/setup' || pathname.startsWith('/setup/')

  // ── /setup gate: only accessible when NOT initialized ──────────
  // Always does a fresh check so the page correctly redirects away
  // after setup completes (even if the uninitialized cookie is stale).
  if (isSetupPage) {
    const initialized = await fetchIsInitialized()
    if (initialized === true) {
      const res = NextResponse.redirect(new URL('/u/login', request.url))
      setInitCookie(res, '1')
      return res
    }
    // Not initialized or network error → let through
    return NextResponse.next()
  }

  // ── Self-service flows: always accessible ──────────────────────
  // /onboarding and /invite are for end-customers; they don't require
  // the platform to be initialized (tenants can sign up any time).
  if (
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname.startsWith('/invite/')
  ) {
    return NextResponse.next()
  }

  // ── Initialization guard for all other routes ──────────────────
  // This includes /u/login — there is no point logging in if setup
  // has not been completed yet.
  const { status: initialized, fromCache } = await resolveInitialized(request)

  if (initialized === false) {
    const res = NextResponse.redirect(new URL('/setup', request.url))
    setInitCookie(res, '0')
    return res
  }

  if (initialized === true && !fromCache) {
    // Cache the result so we don't hit the API on every request
    const res = NextResponse.next()
    setInitCookie(res, '1')
    return res
  }

  // initialized === null (network error) → fail open and continue

  // ── Auth checks ────────────────────────────────────────────────
  const accessToken = getAccessToken(request)

  const isSuperAdminRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/tenants') ||
    pathname.startsWith('/users') ||
    pathname.startsWith('/audit-logs') ||
    (pathname.startsWith('/settings') && !pathname.startsWith('/t/'))

  if (isSuperAdminRoute) {
    if (!accessToken) return NextResponse.next()
    const claims = parseJwtPayload(accessToken)
    if (!claims) return NextResponse.redirect(new URL('/u/login', request.url))
    const sentryTenantId = process.env.SENTRY_TENANT_ID
    const tenantOk = sentryTenantId
      ? claims.tenantId === sentryTenantId
      : claims.tenantSlug === 'sentry'
    const groupOk = Array.isArray(claims.groups) && claims.groups.includes('sentry-internal')
    if (!tenantOk || !groupOk) {
      const slug = (claims.tenantSlug as string) ?? ''
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
  // Run on everything except Next.js internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
