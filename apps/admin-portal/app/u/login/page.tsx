"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepBasedAuthFlow } from "@/components/auth/step-based-auth-flow";
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout";
import { useAuth } from "@fortknox/sdk";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <UniversalAuthLayout
        heroTitle="Welcome back"
        heroSubtitle="Sign in to your Fort Knox account to continue"
        primaryColor="#6366f1"
      >
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
        </div>
      </UniversalAuthLayout>
    );
  }

  if (user) return null; // redirect in progress

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
