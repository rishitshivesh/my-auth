import { loadBranding } from "@/features/auth/api/load-branding";
import { InviteView } from "@/features/auth/views/InviteView";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const branding = await loadBranding();
  return <InviteView token={token} branding={branding} />;
}
