import { Suspense } from "react";
import { loadBranding } from "@/features/auth/api/load-branding";
import { MagicLinkView } from "@/features/auth/views/MagicLinkView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const branding = await loadBranding();
  return (
    <Suspense>
      <MagicLinkView branding={branding} />
    </Suspense>
  );
}
