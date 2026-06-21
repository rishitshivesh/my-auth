'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@scrolloop/sdk'
import { authClient } from '@/lib/auth-client'

interface AdminUser {
  tenantId: string
  tenantSlug?: string
  groups?: string[]
}

function isSuperAdmin(user: AdminUser | null): boolean {
  if (!user) return false
  const claims = authClient.getTokenClaims()
  if (!claims) return false
  const sentryTenantId = process.env.NEXT_PUBLIC_SENTRY_TENANT_ID
  const tenantOk = sentryTenantId
    ? claims.tenantId === sentryTenantId
    : claims.tenantSlug === 'sentry'
  const groupOk = Array.isArray(claims.groups) &&
    claims.groups.includes('sentry-internal')
  return tenantOk && groupOk
}

export function withAdmin<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  function AdminGuard(props: P) {
    const router = useRouter()
    const { user, isLoading } = useAuth()

    useEffect(() => {
      if (isLoading) return
      if (!user) {
        router.replace('/u/login')
        return
      }
      if (!isSuperAdmin(user)) {
        const slug = authClient.getUserTenantSlug() ?? ''
        router.replace(`/t/${slug}/dashboard`)
      }
    }, [user, isLoading, router])

    // Show nothing while checking auth — do NOT flash the page content
    if (isLoading) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )
    }

    // Show nothing if not authorized (redirect is in progress)
    if (!user || !isSuperAdmin(user)) {
      return null
    }

    return <Component {...props} />
  }

  AdminGuard.displayName = `withAdmin(${Component.displayName ?? Component.name ?? 'Component'})`
  return AdminGuard
}
