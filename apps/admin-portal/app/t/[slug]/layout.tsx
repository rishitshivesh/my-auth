import { type ReactNode } from "react";
import { TenantConsoleFrame } from "@/features/shell/views/TenantConsoleFrame";

export default async function TenantLayout({
  children, params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TenantConsoleFrame slug={slug}>{children}</TenantConsoleFrame>;
}
