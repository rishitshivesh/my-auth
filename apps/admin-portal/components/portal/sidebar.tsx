"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button, Input, Label } from "@repo/ui"

interface SidebarItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: string | number
}

interface SidebarProps {
  items: SidebarItem[]
  currentPath?: string
  collapsed?: boolean
  logoUrl?: string
  tenantName?: string
}

export function Sidebar({
  items,
  currentPath = "/",
  collapsed = false,
  logoUrl,
  tenantName = "Fort Knox",
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed)

  return (
    <div
      className={`flex flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between border-b border-sidebar-border px-6 py-4">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
              FK
            </div>
            <span className="font-semibold truncate">{tenantName}</span>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => setIsCollapsed(!isCollapsed)} className="h-8 w-8 p-0">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </Button>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-6">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <a
              className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                currentPath === item.href
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="h-5 w-5">{item.icon}</span>
                {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </div>
              {!isCollapsed && item.badge && (
                <span className="rounded-full bg-primary/20 px-2 py-1 text-xs font-medium text-primary">
                  {item.badge}
                </span>
              )}
            </a>
          </Link>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-6">
        <Button variant="outline" className="w-full justify-start bg-transparent" disabled={isCollapsed}>
          {!isCollapsed && "Sign out"}
        </Button>
      </div>
    </div>
  )
}
