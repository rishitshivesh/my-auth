"use client"

import { useQuery } from "@tanstack/react-query"

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
    queryFn: async () => {
      const baseUrl =
        process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? "http://localhost:4000"
      const params = new URLSearchParams()
      if (tenantSlug) params.set("tenant_slug", tenantSlug)
      const qs = params.toString()
      const res = await fetch(
        `${baseUrl}/auth/providers${qs ? `?${qs}` : ""}`,
      )
      if (!res.ok) throw new Error("Failed to load providers")
      const json: { data?: Providers } & Providers = await res.json()
      return json.data ?? json
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
