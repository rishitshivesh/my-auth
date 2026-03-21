import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyAdminSession, isSuperAdmin } from '@/lib/auth-guard'

export default async function TenantsLayout({
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

  if (!user) redirect('/u/login')
  if (!isSuperAdmin(user)) redirect(`/t/${user.tenantSlug ?? ''}/dashboard`)

  return <>{children}</>
}
