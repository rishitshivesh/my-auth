import { type ReactNode } from "react";
import { DashboardRouteFrame } from "@/features/shell/views/DashboardRouteFrame";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardRouteFrame>{children}</DashboardRouteFrame>;
}
