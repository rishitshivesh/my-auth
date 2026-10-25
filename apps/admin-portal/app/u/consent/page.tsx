import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { ConsentView } from "@/features/auth/views/ConsentView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <ConsentView branding={branding} />
    </Suspense>
  );
}
