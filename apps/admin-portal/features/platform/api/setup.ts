"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-request";
import type { SetupDraft } from "../model/setup";
import type { PlatformInfo } from "../model/types";

export function usePlatformInfo() {
  return useQuery({
    queryKey: ["platform", "info"],
    queryFn: () => apiRequest<PlatformInfo>("GET", "/superadmin/platform-info"),
    retry: false,
  });
}

export function useCreateFirstAdmin() {
  return useMutation({
    mutationFn: (draft: SetupDraft) =>
      apiRequest<{ user: { id: string; email: string } }>("POST", "/superadmin/create-first-admin", {
        headers: { "X-Setup-Token": draft.setupToken.trim() },
        body: {
          platformName: draft.platformName.trim() || undefined,
          name: draft.name.trim(),
          email: draft.email.trim(),
          password: draft.password,
        },
      }),
  });
}
