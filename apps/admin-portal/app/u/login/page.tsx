import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { LoginView } from "@/features/auth/views/LoginView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <LoginView branding={branding} />
    </Suspense>
  );
}
