import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { ResetPasswordView } from "@/features/auth/views/ResetPasswordView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <ResetPasswordView branding={branding} />
    </Suspense>
  );
}
