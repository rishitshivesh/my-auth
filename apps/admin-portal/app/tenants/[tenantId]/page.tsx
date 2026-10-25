import { TenantDetailView } from "@/features/platform/views/TenantDetailView";
import { PageFrame } from "@/components/page/PageFrame";

export default async function TenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return (
    <PageFrame>
      <TenantDetailView tenantId={tenantId} />
    </PageFrame>
  );
}
