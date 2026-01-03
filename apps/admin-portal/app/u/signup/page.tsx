"use client"

import { SignupForm } from "@/components/auth/signup-form"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"

export default function SignupPage() {
  const handleSignup = async (data: any) => {
    console.log("Signup attempt:", data)
    // Mock registration
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return (
    <UniversalAuthLayout
      heroTitle="Create your account"
      heroSubtitle="Join Fort Knox to manage your applications"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Get started</h2>
          <p className="mt-2 text-sm text-muted-foreground">Create a new Fort Knox account in seconds</p>
        </div>
        <SignupForm onSubmit={handleSignup} />
      </div>
    </UniversalAuthLayout>
  )
}
