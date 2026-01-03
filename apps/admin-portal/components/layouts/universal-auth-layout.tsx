"use client"

import type React from "react"

import { AuthHero } from "../../components/branding/auth-hero"

interface UniversalAuthLayoutProps {
  children: React.ReactNode
  logoUrl?: string
  primaryColor?: string
  tenantName?: string
  backgroundImage?: string
  heroTitle?: string
  heroSubtitle?: string
}

export function UniversalAuthLayout({
  children,
  logoUrl,
  primaryColor = "#6366f1",
  tenantName = "Fort Knox",
  backgroundImage,
  heroTitle = "Secure Authentication for Everyone",
  heroSubtitle = "Build trust with enterprise-grade identity platform",
}: UniversalAuthLayoutProps) {
  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <AuthHero
        title={heroTitle}
        subtitle={heroSubtitle}
        backgroundImage={backgroundImage}
        primaryColor={primaryColor}
      />

      <div className="flex w-full flex-col items-center justify-center px-4 py-8 sm:px-6 lg:w-1/2 lg:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              FK
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
