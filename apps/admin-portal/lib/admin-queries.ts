'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetcher, authMutate, apiUrl } from './fetcher'

// ─── Types ─────────────────────────────────────────────────────

export interface PlatformMetrics {
  totalTenants: number
  totalUsers: number
  activeSessions: number
  apiCallsToday: number
}

export interface TenantListItem {
  id: string
  slug: string
  name: string
  plan: string
  status: string
  userCount: number
  createdAt: string
  environment: string
  customDomain?: string
}

export interface TenantDetail extends TenantListItem {
  featureFlags: Record<string, boolean>
  settings: Record<string, any>
  activeSessions: number
  recentActivity: ActivityEvent[]
}

export interface ActivityEvent {
  id: string
  eventType: string
  actorEmail?: string
  severity: string
  createdAt: string
  ipAddress?: string
  tenantId?: string
}

export interface TenantsListResponse {
  tenants: TenantListItem[]
  total: number
}

export interface SlugCheckResult {
  available: boolean
  reason?: string
}

// ─── Platform Dashboard ─────────────────────────────────────────

export function usePlatformMetrics() {
  return useQuery<PlatformMetrics>({
    queryKey: ['admin', 'metrics'],
    queryFn: () => authFetcher<PlatformMetrics>(apiUrl('/admin/dashboard')),
    refetchInterval: 30_000,
  })
}

export function usePlatformActivity(limit = 20) {
  return useQuery<ActivityEvent[]>({
    queryKey: ['admin', 'activity', limit],
    queryFn: () =>
      authFetcher<ActivityEvent[]>(apiUrl(`/admin/activity?limit=${limit}`)),
    refetchInterval: 60_000,
  })
}

// ─── Tenants ────────────────────────────────────────────────────

export function useAdminTenants(params: {
  search?: string
  status?: string
  plan?: string
  page?: number
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.status) qs.set('status', params.status)
  if (params.plan) qs.set('plan', params.plan)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))

  return useQuery<TenantsListResponse>({
    queryKey: ['admin', 'tenants', params],
    queryFn: () =>
      authFetcher<TenantsListResponse>(
        apiUrl(`/admin/tenants?${qs.toString()}`)
      ),
  })
}

export function useAdminTenant(id: string) {
  return useQuery<TenantDetail>({
    queryKey: ['admin', 'tenants', id],
    queryFn: () => authFetcher<TenantDetail>(apiUrl(`/admin/tenants/${id}`)),
    enabled: !!id,
  })
}

export function useCreateTenant() {
  const qc = useQueryClient()
  return useMutation<
    TenantDetail,
    Error,
    { name: string; slug: string; plan: string; ownerEmail?: string }
  >({
    mutationFn: (body) => authMutate(apiUrl('/admin/tenants'), 'POST', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
  })
}

export function useUpdateTenant(id: string) {
  const qc = useQueryClient()
  return useMutation<
    TenantDetail,
    Error,
    { status?: string; name?: string; plan?: string }
  >({
    mutationFn: (body) =>
      authMutate(apiUrl(`/admin/tenants/${id}`), 'PATCH', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
  })
}

export function useDeleteTenant() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => authMutate(apiUrl(`/admin/tenants/${id}`), 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
  })
}

export function useCheckSlug(slug: string, enabled: boolean) {
  return useQuery<SlugCheckResult>({
    queryKey: ['admin', 'check-slug', slug],
    queryFn: () =>
      authFetcher<SlugCheckResult>(
        apiUrl(`/admin/tenants/check-slug?slug=${encodeURIComponent(slug)}`)
      ),
    enabled: enabled && slug.length >= 4,
    staleTime: 5_000,
  })
}

// ─── Settings ────────────────────────────────────────────────────

export interface PlatformSettings {
  platformName: string
  smtpConfigured: boolean
  smtpHost?: string
  supportEmail?: string
  allowPublicSignup: boolean
  maintenanceMode: boolean
}

export function usePlatformSettings() {
  return useQuery<PlatformSettings>({
    queryKey: ['admin', 'settings'],
    queryFn: () => authFetcher<PlatformSettings>(apiUrl('/admin/settings')),
  })
}

export function useUpdatePlatformSettings() {
  const qc = useQueryClient()
  return useMutation<PlatformSettings, Error, Partial<PlatformSettings>>({
    mutationFn: (body) => authMutate(apiUrl('/admin/settings'), 'PATCH', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
    },
  })
}

// ─── Team ────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  email: string
  firstName?: string
  lastName?: string
  addedAt?: string
}

export function useAdminTeam() {
  return useQuery<TeamMember[]>({
    queryKey: ['admin', 'team'],
    queryFn: () => authFetcher<TeamMember[]>(apiUrl('/admin/team')),
  })
}

export function useAddTeamMember() {
  const qc = useQueryClient()
  return useMutation<TeamMember, Error, { email: string }>({
    mutationFn: (body) => authMutate(apiUrl('/admin/team'), 'POST', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'team'] })
    },
  })
}

export function useRemoveTeamMember() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (userId) => authMutate(apiUrl(`/admin/team/${userId}`), 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'team'] })
    },
  })
}
