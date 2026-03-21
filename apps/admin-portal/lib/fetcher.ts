/**
 * Authenticated fetcher for admin API calls.
 * Attaches the current access token via the SDK and handles 401s.
 */
import { authClient } from '@/app/layout'

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:4000'

export function apiUrl(path: string): string {
  return `${AUTH_URL}${path}`
}

export async function authFetcher<T = any>(url: string): Promise<T> {
  const token = await authClient.getAccessToken()
  if (!token) {
    if (typeof window !== 'undefined') {
      window.location.href = '/u/login'
    }
    throw new Error('Not authenticated')
  }

  const res = await fetch(url.startsWith('http') ? url : apiUrl(url), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  })

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/u/login'
    }
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.message ?? `API error ${res.status}`)
  }

  const data = await res.json()
  return (data?.data ?? data) as T
}

export async function authMutate(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  body?: unknown,
): Promise<any> {
  const token = await authClient.getAccessToken()
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(url.startsWith('http') ? url : apiUrl(url), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/u/login'
    }
    throw new Error('Session expired')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message ?? `API error ${res.status}`)
  }

  return data?.data ?? data
}
