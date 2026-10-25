import { DomainsView } from "@/features/tenant-admin/views/DomainsView";
import { PageFrame } from "@/components/page/PageFrame";

export default async function DomainsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <PageFrame>
      <DomainsView slug={slug} />
    </PageFrame>
  );
}
