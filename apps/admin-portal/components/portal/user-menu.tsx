"use client"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"

interface UserMenuProps {
  userName?: string
  userEmail?: string
  userAvatar?: string
  onLogout?: () => void
}

export function UserMenu({
  userName = "John Doe",
  userEmail = "john@example.com",
  userAvatar,
  onLogout,
}: UserMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} className="h-10 w-10 rounded-full p-0">
        {userAvatar ? (
          <img src={userAvatar || "/placeholder.svg"} alt={userName} className="h-full w-full rounded-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            {userName.charAt(0)}
          </div>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-card shadow-lg z-50">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium text-foreground">{userName}</div>
            <div className="text-xs text-muted-foreground">{userEmail}</div>
          </div>

          <div className="space-y-1 p-1">
            <a href="#" className="block rounded px-4 py-2 text-sm text-foreground hover:bg-accent">
              Profile
            </a>
            <a href="#" className="block rounded px-4 py-2 text-sm text-foreground hover:bg-accent">
              Account settings
            </a>
            <a href="#" className="block rounded px-4 py-2 text-sm text-foreground hover:bg-accent">
              Help & support
            </a>
          </div>

          <button
            onClick={() => {
              onLogout?.()
              setOpen(false)
            }}
            className="w-full border-t border-border px-4 py-2 text-left text-sm text-destructive hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
