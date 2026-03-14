"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@fortknox/sdk"
import { Skeleton } from "@repo/ui"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/u/login")
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-64 border-r border-border bg-card p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-40" />
          <div className="space-y-1 pt-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="border-b border-border px-8 py-4 bg-card">
            <Skeleton className="h-6 w-40" />
          </div>
          <div className="p-8 space-y-6">
            <Skeleton className="h-16 w-full rounded-xl" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-6">
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-72 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
