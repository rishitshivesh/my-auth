import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/app/layout";
import type { DashboardData, MfaStatus, TotpSetupData } from "./types";

function apiUrl(path: string): string {
  return `${authClient.getBaseURL()}${path}`;
}

// ─── Dashboard ───────────────────────────────────────────────

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await authClient.request({ url: apiUrl("/dashboard"), method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.data.data;
    },
  });
}

// ─── MFA ─────────────────────────────────────────────────────

export function useMfaStatus() {
  return useQuery<MfaStatus>({
    queryKey: ["mfa", "status"],
    queryFn: async () => {
      const res = await authClient.request({ url: apiUrl("/mfa/status"), method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch MFA status");
      return res.data.data;
    },
  });
}

export function useSetupTotp() {
  return useMutation<TotpSetupData>({
    mutationFn: async () => {
      const res = await authClient.request({ url: apiUrl("/mfa/setup/totp"), method: "POST" });
      if (!res.ok) throw new Error("Failed to start TOTP setup");
      return res.data.data;
    },
  });
}

export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (token: string) => {
      const res = await authClient.request({
        url: apiUrl("/mfa/verify/totp"),
        method: "POST",
        body: { token },
      });
      if (!res.ok) throw new Error("Invalid code. Please try again.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDisableTotp() {
  const qc = useQueryClient();
  return useMutation<void>({
    mutationFn: async () => {
      const res = await authClient.request({ url: apiUrl("/mfa/totp"), method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disable TOTP");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
