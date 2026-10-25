import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { MfaEnrollView } from "@/features/auth/views/MfaEnrollView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <MfaEnrollView branding={branding} />
    </Suspense>
  );
}
