import { AuditView } from "@/features/tenant-admin/views/AuditView";
import { PageFrame } from "@/components/page/PageFrame";

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <PageFrame>
      <AuditView slug={slug} />
    </PageFrame>
  );
}
