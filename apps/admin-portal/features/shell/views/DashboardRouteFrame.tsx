"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { platformRoutes } from "@/constants/routes";
import { AccountConsoleFrame } from "./AccountConsoleFrame";
import { PlatformConsoleFrame } from "./PlatformConsoleFrame";

/**
 * `/dashboard` is the platform operator dashboard; every route beneath it
 * (`/dashboard/profile`, `/dashboard/security`, ...) is the personal account.
 * One shell is chosen per request, never both.
 */
export function DashboardRouteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPlatformDashboard = pathname === platformRoutes.dashboard();
  return isPlatformDashboard
    ? <PlatformConsoleFrame>{children}</PlatformConsoleFrame>
    : <AccountConsoleFrame>{children}</AccountConsoleFrame>;
}
