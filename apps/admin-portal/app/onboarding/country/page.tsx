"use client"

import { useState } from "react"
import { OnboardingLayout } from "@/components/layouts/onboarding-layout"
import { CountrySelector } from "@/components/onboarding/country-selector"

export default function CountryPage() {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  // SPRINT_N: wire to POST /tenants/onboarding/country once onboarding flow is implemented
  const handleCountrySelect = (country: string) => {
    setSelectedCountry(country)
  }

  return (
    <OnboardingLayout step={1} totalSteps={2} tenantName="Scrolloop Sentry">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Where are you located?</h1>
          <p className="text-base text-muted-foreground">
            This helps us provide the best service and ensure compliance with local regulations
          </p>
        </div>

        <CountrySelector onSelect={handleCountrySelect} />
      </div>
    </OnboardingLayout>
  )
}
