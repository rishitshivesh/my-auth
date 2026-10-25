"use client";

import { GlobalStateView } from "@/features/capabilities/views/GlobalStateView";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <GlobalStateView kind="error" onRetry={reset} reference={error.digest} />;
}
