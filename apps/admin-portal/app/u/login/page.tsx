"use client"

import { StepBasedAuthFlow } from "@/components/auth/step-based-auth-flow"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"

export default function LoginPage() {
  return (
    <UniversalAuthLayout
      heroTitle="Welcome back"
      heroSubtitle="Sign in to your Fort Knox account to continue"
      primaryColor="#6366f1"
    >
      <StepBasedAuthFlow primaryColor="#6366f1" />
    </UniversalAuthLayout>
  )
}
