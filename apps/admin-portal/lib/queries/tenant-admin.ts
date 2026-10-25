import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { Client, DashboardUser, Role, UserListResponse } from "@/lib/types";
import { apiUrl } from "./shared";

// ─── Tenant Admin Dashboard ──────────────────────────────────────

export function useTenantUsers(params: {
  search?: string;
  status?: "active" | "suspended" | "all";
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status === "active") qs.set("isActive", "true");
  if (params.status === "suspended") qs.set("isActive", "false");
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.limit ?? 20));

  return useQuery<UserListResponse>({
    queryKey: ["tenant", "users", params],
    queryFn: withErrorHandler<[], UserListResponse>(
      async () => authClient.request({
        url: apiUrl(`/users?${qs.toString()}`),
        method: "GET",
      })
    ),
  });
}

export function useTenantUser(userId: string) {
  return useQuery<DashboardUser>({
    queryKey: ["tenant", "users", userId],
    queryFn: withErrorHandler<[], DashboardUser>(
      async () => authClient.request({
        url: apiUrl(`/users/${userId}`),
        method: "GET",
      })
    ),
    enabled: !!userId,
  });
}

export function useTenantRoles() {
  return useQuery<Role[]>({
    queryKey: ["tenant", "roles"],
    queryFn: withErrorHandler<[], Role[]>(
      async () => authClient.request({
        url: apiUrl(`/rbac/roles?loadPermissions=true`),
        method: "GET",
      })
    ),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation<Role, Error, { name: string; description?: string }>({
    mutationFn: withErrorHandler<[{ name: string; description?: string }], Role>(
      async (body) => authClient.request({
        url: apiUrl("/rbac/roles"),
        method: "POST",
        body,
      }),
      { successMessage: "Role created successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation<Role, Error, { id: string; name: string; description?: string }>({
    mutationFn: withErrorHandler<[{ id: string; name: string; description?: string }], Role>(
      async ({ id, ...body }) => authClient.request({
        url: apiUrl(`/rbac/roles/${id}`),
        method: "PUT",
        body,
      }),
      { successMessage: "Role updated successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "roles"] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id) => authClient.request({
        url: apiUrl(`/rbac/roles/${id}`),
        method: "DELETE",
      }),
      { successMessage: "Role deleted successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "roles"] }),
  });
}

export function useTenantClients() {
  return useQuery<Client[]>({
    queryKey: ["tenant", "clients"],
    queryFn: withErrorHandler<[], Client[]>(
      async () => authClient.request({
        url: apiUrl(`/oauth/clients`),
        method: "GET",
      })
    ),
  });
}

export function useCreateTenantClient() {
  const qc = useQueryClient();
  return useMutation<Client & { clientSecret: string }, Error, { name: string; clientType: string; redirectUris?: string[]; grantTypes?: string[] }>({
    mutationFn: withErrorHandler<[{ name: string; clientType: string; redirectUris?: string[]; grantTypes?: string[] }], Client & { clientSecret: string }>(
      async (body) => authClient.request({
        url: apiUrl("/oauth/clients"),
        method: "POST",
        body,
      }),
      { successMessage: "Client created successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "clients"] }),
  });
}

export function useUpdateTenantClient() {
  const qc = useQueryClient();
  return useMutation<Client, Error, { id: string; name?: string; redirectUris?: string[]; grantTypes?: string[]; isActive?: boolean }>({
    mutationFn: withErrorHandler<[{ id: string; name?: string; redirectUris?: string[]; grantTypes?: string[]; isActive?: boolean }], Client>(
      async ({ id, ...body }) => authClient.request({
        url: apiUrl(`/oauth/clients/${id}`),
        method: "PUT",
        body,
      }),
      { successMessage: "Client updated successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "clients"] }),
  });
}

export function useDeleteTenantClient() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (id) => authClient.request({
        url: apiUrl(`/oauth/clients/${id}`),
        method: "DELETE",
      }),
      { successMessage: "Client deleted successfully", showSuccessToast: true }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "clients"] }),
  });
}

export function useRotateClientSecret() {
  return useMutation<{ clientSecret: string }, Error, string>({
    mutationFn: withErrorHandler<[string], { clientSecret: string }>(
      async (id) => authClient.request({
        url: apiUrl(`/oauth/clients/${id}/rotate-secret`),
        method: "POST",
      }),
      { successMessage: "Client secret rotated successfully", showSuccessToast: true }
    ),
  });
}
