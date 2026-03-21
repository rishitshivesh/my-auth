/**
 * Superadmin Dashboard Layout — Server Component
 *
 * Enforces that only Fort Knox internal (fortknox-internal group) users
 * can access /dashboard and its sub-routes.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyAdminSession, isSuperAdmin } from '@/lib/auth-guard'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')

  const user = await verifyAdminSession(cookieHeader)

  if (!user) {
    redirect('/u/login')
  }

  if (!isSuperAdmin(user)) {
    // Authenticated but not a superadmin — send to their tenant portal
    const slug = user.tenantSlug ?? ''
    redirect(`/t/${slug}/dashboard`)
  }

  return <>{children}</>
}
