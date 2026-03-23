'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetcher, authMutate, apiUrl } from '@/lib/fetcher'

export interface PortalBranding {
  primaryColor: string
  logoUrl: string | null
  fontFamily: string
  headerWeight: 'regular' | 'bold'
  backgroundStyle: 'solid' | 'gradient'
  tenantName?: string
}

// Fetch branding for the authenticated tenant's portal config
export function usePortalBranding(tenantId?: string) {
  return useQuery<PortalBranding>({
    queryKey: ['portal-branding', tenantId],
    queryFn: () =>
      authFetcher<PortalBranding>(
        tenantId
          ? apiUrl(`/tenants/${tenantId}/branding`)
          : apiUrl('/dashboard/branding')
      ),
    enabled: !!tenantId || true,
    staleTime: 60_000,
  })
}

export function useUpdatePortalBranding() {
  const qc = useQueryClient()
  return useMutation<PortalBranding, Error, Partial<PortalBranding>>({
    mutationFn: (data) =>
      authMutate(apiUrl('/dashboard/branding'), 'PUT', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-branding'] })
    },
  })
}
