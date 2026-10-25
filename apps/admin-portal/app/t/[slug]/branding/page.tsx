import { BrandingView } from "@/features/tenant-admin/views/BrandingView";
import { PageFrame } from "@/components/page/PageFrame";

export default async function BrandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <PageFrame>
      <BrandingView slug={slug} />
    </PageFrame>
  );
}
