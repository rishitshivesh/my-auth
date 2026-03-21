/**
 * Superadmin Dashboard Layout — Server Component
 *
 * Enforces that only Fort Knox internal (fortknox-internal group) users
 * can access /dashboard and its sub-routes.
 */
import cookies from "js-cookie";
import { redirect } from "next/navigation";
import { verifyAdminSession, isSuperAdmin } from "@/lib/auth-guard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifyAdminSession();

  if (!user) {
    redirect("/u/login");
  }

  if (!isSuperAdmin(user)) {
    // Authenticated but not a superadmin — send to their tenant portal
    const slug = user.tenantSlug ?? "";
    redirect(`/t/${slug}/dashboard`);
  }

  return <>{children}</>;
}
