/**
 * Server-side admin guard utilities
 * Used in Server Component layouts to protect superadmin routes
 */

const AUTH_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || "http://localhost:4000";
const FORTKNOX_TENANT_ID = process.env.FORTKNOX_TENANT_ID || "";

export interface AdminUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  tenantId: string;
  tenantSlug?: string;
  groups?: string[];
}

/**
 * Verify superadmin session server-side.
 * Reads httpOnly refresh cookie, exchanges it for an access token,
 * fetches /users/me, and checks fortknox-internal membership.
 *
 * Returns the user if the session is valid and the user is a superadmin.
 * Returns null if the session is invalid or the user lacks superadmin access.
 */
export async function verifyAdminSession(
  todoRemoveThis?: string,
): Promise<AdminUser | null> {
  if (!FORTKNOX_TENANT_ID) {
    console.warn("[AdminGuard] FORTKNOX_TENANT_ID is not set");
    return null;
  }

  try {
    // Step 1: Refresh the access token using the httpOnly refresh cookie
    const refreshRes = await fetch(`${AUTH_SERVICE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": FORTKNOX_TENANT_ID,
      },
      cache: "no-store",
    });

    if (!refreshRes.ok) return null;

    const refreshData = await refreshRes.json().catch(() => null);
    const accessToken =
      refreshData?.data?.accessToken ?? refreshData?.accessToken;
    if (!accessToken) return null;

    // Step 2: Fetch the current user
    const userRes = await fetch(`${AUTH_SERVICE_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Tenant-ID": FORTKNOX_TENANT_ID,
      },
      cache: "no-store",
    });

    if (!userRes.ok) return null;

    const userData = await userRes.json().catch(() => null);
    const user = userData?.data ?? userData;

    if (!user?.id) return null;

    // Parse groups from the access token JWT payload
    let groups: string[] = [];
    let tenantSlug: string | undefined;
    try {
      const parts = accessToken.split(".");
      if (parts[1]) {
        const payload = JSON.parse(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        groups = Array.isArray(payload.groups) ? payload.groups : [];
        tenantSlug = payload.tenantSlug;
      }
    } catch {
      // ignore parse errors
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      tenantSlug: tenantSlug ?? user.tenantSlug,
      groups,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a user has Fort Knox internal superadmin access.
 */
export function isSuperAdmin(user: AdminUser): boolean {
  return (
    user.tenantId === FORTKNOX_TENANT_ID &&
    Array.isArray(user.groups) &&
    user.groups.includes("fortknox-internal")
  );
}
