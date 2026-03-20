'use client'

import { useState, useEffect, useRef } from 'react'
import { apiUrl, authFetcher } from '@/lib/fetcher'

interface SlugInputProps {
  value: string
  onChange: (value: string) => void
  onAvailabilityChange?: (available: boolean) => void
  className?: string
}

type SlugState = 'idle' | 'checking' | 'available' | 'unavailable'

export function SlugInput({
  value,
  onChange,
  onAvailabilityChange,
  className = '',
}: SlugInputProps) {
  const [slugState, setSlugState] = useState<SlugState>('idle')
  const [reason, setReason] = useState<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value || value.length < 4) {
      setSlugState('idle')
      onAvailabilityChange?.(false)
      return
    }

    setSlugState('checking')

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await authFetcher<{ available: boolean; reason?: string }>(
          apiUrl(`/admin/tenants/check-slug?slug=${encodeURIComponent(value)}`)
        )
        if (result.available) {
          setSlugState('available')
          setReason('')
          onAvailabilityChange?.(true)
        } else {
          setSlugState('unavailable')
          setReason(result.reason ?? 'This slug is not available')
          onAvailabilityChange?.(false)
        }
      } catch {
        setSlugState('unavailable')
        setReason('Could not check availability')
        onAvailabilityChange?.(false)
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    onChange(cleaned)
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="my-company"
          maxLength={63}
          className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 pr-8 ${className}`}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {slugState === 'checking' && (
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          )}
          {slugState === 'available' && (
            <span className="text-emerald-500 text-sm font-bold">✓</span>
          )}
          {slugState === 'unavailable' && (
            <span className="text-destructive text-sm font-bold">✗</span>
          )}
        </div>
      </div>

      {slugState === 'available' && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Available
        </p>
      )}
      {slugState === 'unavailable' && reason && (
        <p className="text-xs text-destructive">{reason}</p>
      )}
      {value.length > 0 && value.length < 4 && (
        <p className="text-xs text-muted-foreground">
          Minimum 4 characters
        </p>
      )}
    </div>
  )
}
