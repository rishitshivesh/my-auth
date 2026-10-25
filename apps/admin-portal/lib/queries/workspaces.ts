import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";

// ─── User Workspaces ─────────────────────────────────────────

export interface UserWorkspace {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  isGuest: boolean;
  logoUrl?: string;
}

export function useUserWorkspaces() {
  return useQuery<UserWorkspace[]>({
    queryKey: ['user', 'workspaces'],
    queryFn: withErrorHandler<[], UserWorkspace[]>(
      async () => authClient.getUserOrgs()
    ),
    staleTime: 5 * 60_000,
  });
}
