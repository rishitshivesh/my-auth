"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlobalStateView } from "@/features/capabilities/views/GlobalStateView";

function ErrorContent() {
  const router = useRouter();
  const reason = useSearchParams().get("reason") ?? "";
  const kind = reason === "api_unavailable" ? "unavailable" : reason === "forbidden" ? "denied" : "error";
  return <GlobalStateView kind={kind} reference={reason || undefined} onRetry={() => router.refresh()} />;
}

/** Destination of middleware redirects (auth service unreachable, access denied). */
export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
