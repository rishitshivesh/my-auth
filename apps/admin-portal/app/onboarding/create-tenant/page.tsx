"use client"

import { OnboardingLayout } from "@/components/layouts/onboarding-layout"
import { CreateTenantForm } from "@/components/onboarding/create-tenant-form"

export default function CreateTenantPage() {
  const handleCreateTenant = async (data: any) => {
    console.log("Creating tenant:", data)
    // In a real app, send to backend and navigate to portal
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return (
    <OnboardingLayout step={2} totalSteps={2} tenantName="Fort Knox">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Create your tenant</h1>
          <p className="text-base text-muted-foreground">
            Set up your organization in Fort Knox. You can always change these details later.
          </p>
        </div>

        <CreateTenantForm onSubmit={handleCreateTenant} />
      </div>
    </OnboardingLayout>
  )
}
