"use client";

import "@repo/ui/globals.css";
import { GlobalStateView } from "@/features/capabilities/views/GlobalStateView";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        <GlobalStateView kind="unavailable" onRetry={reset} reference={error.digest} />
      </body>
    </html>
  );
}
