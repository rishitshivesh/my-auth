"use client"

import { OnboardingLayout } from "@/components/layouts/onboarding-layout"
import { CreateTenantForm } from "@/components/onboarding/create-tenant-form"

export default function CreateTenantPage() {
  // SPRINT_N: wire to POST /tenants once onboarding flow is implemented
  const handleCreateTenant = async (_data: unknown) => {
    throw new Error('Tenant creation not yet implemented');
  }

  return (
    <OnboardingLayout step={2} totalSteps={2} tenantName="Scrolloop Sentry">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Create your tenant</h1>
          <p className="text-base text-muted-foreground">
            Set up your organization in Scrolloop Sentry. You can always change these details later.
          </p>
        </div>

        <CreateTenantForm onSubmit={handleCreateTenant} />
      </div>
    </OnboardingLayout>
  )
}
