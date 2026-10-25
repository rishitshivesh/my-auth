import { type ReactNode } from "react";
import { PlatformConsoleFrame } from "@/features/shell/views/PlatformConsoleFrame";

export default function Layout({ children }: { children: ReactNode }) {
  return <PlatformConsoleFrame>{children}</PlatformConsoleFrame>;
}
