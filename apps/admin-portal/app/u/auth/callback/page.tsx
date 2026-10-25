import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { SocialCallbackView } from "@/features/auth/views/SocialCallbackView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <SocialCallbackView branding={branding} />
    </Suspense>
  );
}
