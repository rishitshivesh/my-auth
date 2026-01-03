"use client"

import type React from "react"

interface PublicLayoutProps {
  children: React.ReactNode
  logoUrl?: string
  tenantName?: string
  showNav?: boolean
}

export function PublicLayout({ children, logoUrl, tenantName = "Fort Knox", showNav = true }: PublicLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {showNav && (
        <nav className="border-b border-border px-6 py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                FK
              </div>
              <span className="font-semibold text-foreground">{tenantName}</span>
            </div>
            <div className="flex gap-4">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Docs
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Pricing
              </a>
              <a href="/u/login" className="text-sm text-primary hover:underline font-medium">
                Sign in
              </a>
            </div>
          </div>
        </nav>
      )}

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="border-t border-border bg-card px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Security
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Developers</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    API Reference
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    SDKs
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Careers
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Security
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8">
            <p className="text-sm text-muted-foreground text-center">© 2025 Fort Knox. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
