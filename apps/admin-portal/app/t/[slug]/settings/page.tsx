import { GeneralSettingsView } from "@/features/tenant-admin/views/GeneralSettingsView";
import { PageFrame } from "@/components/page/PageFrame";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <PageFrame>
      <GeneralSettingsView slug={slug} />
    </PageFrame>
  );
}
