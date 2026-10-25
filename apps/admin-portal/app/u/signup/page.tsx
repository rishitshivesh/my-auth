import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { SignupView } from "@/features/auth/views/SignupView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <SignupView branding={branding} />
    </Suspense>
  );
}
