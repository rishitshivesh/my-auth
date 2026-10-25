"use client";

import type { ReactNode } from "react";
import { AuthShell } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { PublicTenantBranding } from "../api/tenant-branding";

export interface HostedFrameProps {
  title: string;
  description?: string;
  branding?: PublicTenantBranding | null;
  footer?: ReactNode;
  children: ReactNode;
}

/** Hosted identity layout: AuthShell plus validated tenant branding (logo + accent only). */
export function HostedFrame({ title, description, branding, footer, children }: HostedFrameProps) {
  const { t } = useCopy();
  return (
    <AuthShell
      title={title}
      description={description}
      brandColor={branding?.primaryColor}
      brand={branding?.logoUrl ? <BrandLogo url={branding.logoUrl} /> : undefined}
      footer={footer}
      landmarkLabel={t("auth.shell.mainLabel")}
    >
      {children}
    </AuthShell>
  );
}

function BrandLogo({ url }: { url: string }) {
  // Tenant logos are arbitrary remote images; next/image would need a host allow-list.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-10 w-auto max-w-[12rem] object-contain" />;
}
