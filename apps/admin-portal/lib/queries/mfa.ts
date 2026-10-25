import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";
import { MfaStatus, TotpSetupData } from "@/lib/types";
import { apiUrl } from "./shared";

// ─── MFA ─────────────────────────────────────────────────────

export function useMfaStatus() {
  return useQuery<MfaStatus>({
    queryKey: ["mfa", "status"],
    queryFn: withErrorHandler<[], MfaStatus>(
      async () => authClient.request({ url: apiUrl("/mfa/status"), method: "GET" })
    ),
  });
}

export function useSetupTotp() {
  return useMutation<TotpSetupData>({
    mutationFn: withErrorHandler<[], TotpSetupData>(
      async () => authClient.request({ url: apiUrl("/mfa/setup/totp"), method: "POST" })
    ),
  });
}

export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation<{ backupCodes: string[]; message?: string }, Error, string>({
    mutationFn: withErrorHandler<[string], { backupCodes: string[]; message?: string }>(
      async (token: string) => authClient.request({
        url: apiUrl("/mfa/verify/totp"),
        method: "POST",
        body: { token },
      }),
      { errorMessage: "Invalid code. Please try again.", showErrorToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDisableTotp() {
  const qc = useQueryClient();
  return useMutation<void>({
    mutationFn: withErrorHandler<[], void>(
      async () => authClient.request({ url: apiUrl("/mfa/totp"), method: "DELETE" }),
      { errorMessage: "Failed to disable TOTP", showErrorToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRequestEmailOtp() {
  return useMutation<{ message: string; expiresIn: string }, Error, void>({
    mutationFn: withErrorHandler<[], { message: string; expiresIn: string }>(
      async () => authClient.request({ url: apiUrl("/mfa/request-email-otp"), method: "POST" }),
      { successMessage: "Verification code sent to your email", showSuccessToast: true }
    ),
  });
}

export function useVerifyEmailOtp() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: withErrorHandler<[string], void>(
      async (code: string) => authClient.request({
        url: apiUrl("/mfa/verify-email-otp"),
        method: "POST",
        body: { code },
      }),
      { successMessage: "Email MFA enabled successfully", showSuccessToast: true, errorMessage: "Invalid or expired code. Please try again.", showErrorToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDisableAllMfa() {
  const qc = useQueryClient();
  return useMutation<void>({
    mutationFn: withErrorHandler<[], void>(
      async () => authClient.request({ url: apiUrl("/mfa/all"), method: "DELETE" }),
      { successMessage: "All MFA methods disabled successfully", showSuccessToast: true, errorMessage: "Failed to disable MFA", showErrorToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRegenerateBackupCodes() {
  const qc = useQueryClient();
  return useMutation<{ backupCodes: string[]; count: number }, Error, void>({
    mutationFn: withErrorHandler<[], { backupCodes: string[]; count: number }>(
      async () => authClient.request({
        url: apiUrl("/mfa/backup-codes/regenerate"),
        method: "POST",
      }),
      { successMessage: "Backup codes regenerated successfully", showSuccessToast: true }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mfa", "status"] });
    },
  });
}
