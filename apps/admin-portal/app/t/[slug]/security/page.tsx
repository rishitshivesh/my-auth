import { SecurityPolicyView } from "@/features/tenant-admin/views/SecurityPolicyView";
import { PageFrame } from "@/components/page/PageFrame";

export default async function SecurityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <PageFrame>
      <SecurityPolicyView slug={slug} />
    </PageFrame>
  );
}
