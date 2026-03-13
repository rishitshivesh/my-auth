"use client";

import { StepBasedAuthFlow } from "@/components/auth/step-based-auth-flow";
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout";
import { useAuth } from "@fortknox/sdk";

export default function LoginPage() {
  const { user } = useAuth();
  console.log(user);

  return (
    <UniversalAuthLayout
      heroTitle="Welcome back"
      heroSubtitle="Sign in to your Fort Knox account to continue"
      primaryColor="#6366f1"
    >
      <StepBasedAuthFlow primaryColor="#6366f1" />
    </UniversalAuthLayout>
  );
}
