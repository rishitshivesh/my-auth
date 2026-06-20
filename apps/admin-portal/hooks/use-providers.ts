"use client"

import { useQuery } from "@tanstack/react-query"
import { authClient } from "@/app/layout"
import { withErrorHandler } from "@/lib/with-error-handler"

export interface SocialProvider {
  provider: string
  enabled: boolean
  displayName?: string
}

export interface Providers {
  password: boolean
  magicLink: boolean
  passkey: boolean
  social: SocialProvider[]
}

export function useProviders(tenantSlug?: string) {
  return useQuery<Providers>({
    queryKey: ["providers", tenantSlug],
    queryFn: withErrorHandler<[], Providers>(
      async () => {
        const baseUrl = authClient.getBaseURL()
        const params = new URLSearchParams()
        if (tenantSlug) params.set("tenant_slug", tenantSlug)
        const qs = params.toString()
        
        return authClient.request({
          url: `${baseUrl}/auth/providers${qs ? `?${qs}` : ""}`,
          method: "GET",
        })
      },
      { showErrorToast: false }
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
