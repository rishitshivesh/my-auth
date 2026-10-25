"use client";

import { type ReactNode } from "react";
import { PageHeader } from "@repo/ui";

export interface PageFrameProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  /** `narrow` suits forms and personal-account pages; `wide` suits tables and dashboards. */
  size?: "narrow" | "wide";
  children: ReactNode;
}

const WIDTH = { narrow: "max-w-4xl", wide: "max-w-6xl" } as const;

/**
 * The one content wrapper for every console page (tenant, platform, account).
 * The surrounding shell comes from the route layout; this adds the width
 * constraint and, when a title is given, the shared page header.
 */
export function PageFrame({ title, subtitle, action, size = "wide", children }: PageFrameProps) {
  return (
    <div className={`mx-auto w-full space-y-6 ${WIDTH[size]}`}>
      {title && <PageHeader title={title} subtitle={subtitle} action={action} className="mb-0 flex-wrap" />}
      {children}
    </div>
  );
}
