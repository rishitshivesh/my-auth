import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { MfaChallengeView } from "@/features/auth/views/MfaChallengeView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <MfaChallengeView branding={branding} />
    </Suspense>
  );
}
