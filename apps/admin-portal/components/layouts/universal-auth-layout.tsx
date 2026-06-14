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
  fontFamily?: string
  backgroundStyle?: "solid" | "gradient"
}

export function UniversalAuthLayout({
  children,
  logoUrl,
  primaryColor = "#6366f1",
  tenantName = "Scrolloop Sentry",
  backgroundImage,
  heroTitle = "Secure Authentication for Everyone",
  heroSubtitle = "Build trust with enterprise-grade identity platform",
  fontFamily = "Inter",
  backgroundStyle = "solid",
}: UniversalAuthLayoutProps) {
  const heroBackground =
    backgroundStyle === "gradient"
      ? `linear-gradient(135deg, ${primaryColor}cc, ${primaryColor}88)`
      : primaryColor

  return (
    <div
      className="flex min-h-screen overflow-hidden bg-background"
      style={{ fontFamily }}
    >
      <AuthHero
        title={heroTitle}
        subtitle={heroSubtitle}
        backgroundImage={backgroundImage}
        primaryColor={primaryColor}
        background={heroBackground}
      />

      <div className="flex w-full flex-col items-center justify-center px-4 py-8 sm:px-6 lg:w-1/2 lg:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${tenantName} logo`}
                className="h-10 object-contain"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg font-bold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                SS
              </div>
            )}
          </div>

          {children}

          {/* "Secured by Scrolloop Sentry" badge — always present (contractual) */}
          <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                clipRule="evenodd"
              />
            </svg>
            Secured by Scrolloop Sentry
          </div>
        </div>
      </div>
    </div>
  )
}
