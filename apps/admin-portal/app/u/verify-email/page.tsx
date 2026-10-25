import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { VerifyEmailView } from "@/features/auth/views/VerifyEmailView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <VerifyEmailView branding={branding} />
    </Suspense>
  );
}
