"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StepBasedAuthFlow } from "@/components/auth/step-based-auth-flow";
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout";
import { useAuth } from "@fortknox/sdk";
import type { BrandingConfig } from "@/lib/types";
import { authClient } from "@/app/layout";

const DEFAULT_BRANDING: BrandingConfig = {
  primaryColor: "#6366f1",
  fontFamily: "Inter",
  headerWeight: "bold",
  backgroundStyle: "solid",
};

async function fetchPublicBranding(slug: string): Promise<BrandingConfig> {
  const url = `${authClient.getBaseURL()}/tenants/${encodeURIComponent(slug)}/branding/public`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return DEFAULT_BRANDING;
  const json = await res.json();
  return (json?.data ?? json) as BrandingConfig;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenant") ?? null;
  const { user, isLoading } = useAuth();

  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // Fetch tenant branding (client-side, public endpoint – no auth needed)
  useEffect(() => {
    if (!tenantSlug) {
      setBrandingLoaded(true);
      return;
    }
    fetchPublicBranding(tenantSlug)
      .then((b) => {
        setBranding(b ?? DEFAULT_BRANDING);
      })
      .catch(() => setBranding(DEFAULT_BRANDING))
      .finally(() => setBrandingLoaded(true));
  }, [tenantSlug]);

  // Apply branding as CSS custom properties on <html> so all child components
  // can reference var(--brand-primary), var(--brand-font), etc.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", branding.primaryColor);
    root.style.setProperty("--brand-font", branding.fontFamily);
    root.style.setProperty(
      "--brand-header-weight",
      branding.headerWeight === "bold" ? "700" : "400",
    );
    return () => {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-font");
      root.style.removeProperty("--brand-header-weight");
    };
  }, [branding]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || !brandingLoaded) {
    return (
      <UniversalAuthLayout
        heroTitle="Welcome back"
        heroSubtitle="Sign in to continue"
        primaryColor={branding.primaryColor}
        fontFamily={branding.fontFamily}
        backgroundStyle={branding.backgroundStyle}
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
      heroSubtitle="Sign in to continue"
      primaryColor={branding.primaryColor}
      logoUrl={branding.logoUrl}
      fontFamily={branding.fontFamily}
      backgroundStyle={branding.backgroundStyle}
    >
      <StepBasedAuthFlow primaryColor={branding.primaryColor} />
    </UniversalAuthLayout>
  );
}
