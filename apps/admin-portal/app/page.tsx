"use client"

import { Button } from "@repo/ui"
import { PublicLayout } from "@/components/layouts/public-layout"

export default function HomePage() {
  return (
    <PublicLayout tenantName="Fort Knox" showNav={true}>
      <div className="flex-1">
        <div className="px-6 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl text-balance">
                Enterprise-Grade Identity for Everyone
              </h1>
              <p className="mt-6 text-lg text-muted-foreground sm:text-xl text-balance max-w-2xl mx-auto">
                Fort Knox is a modern, secure, and compliant identity platform designed to help you manage users,
                applications, and access control with ease.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row items-center justify-center">
                <Button size="lg" className="min-w-40">
                  Get Started
                </Button>
                <Button size="lg" variant="outline" className="min-w-40 bg-transparent">
                  Learn More
                </Button>
              </div>
            </div>

            <div className="mt-20 grid gap-8 md:grid-cols-3">
              {[
                {
                  title: "Secure by Default",
                  description: "Enterprise-grade security with Zero Trust architecture and compliance certifications.",
                },
                {
                  title: "Developer Friendly",
                  description: "Simple APIs, SDKs, and documentation to integrate authentication in minutes.",
                },
                {
                  title: "Infinitely Scalable",
                  description: "Built for growth. Handle millions of users without performance degradation.",
                },
              ].map((feature) => (
                <div key={feature.title} className="rounded-lg border border-border bg-card p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                    ✓
                  </div>
                  <h3 className="font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-20 rounded-lg border border-border bg-card p-8 md:p-12">
              <h2 className="text-2xl font-bold text-foreground mb-6">Key Features</h2>

              <div className="grid gap-6 md:grid-cols-2">
                {[
                  { name: "Multi-Factor Authentication", icon: "🔐" },
                  { name: "Social Login Integration", icon: "👥" },
                  { name: "Role-Based Access Control", icon: "🎯" },
                  { name: "Real-Time Dashboard", icon: "📊" },
                  { name: "Audit Logging", icon: "📝" },
                  { name: "Custom Branding", icon: "🎨" },
                ].map((feature) => (
                  <div key={feature.name} className="flex gap-3">
                    <span className="text-2xl">{feature.icon}</span>
                    <span className="text-foreground font-medium">{feature.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
