import { ApplicationDetailView } from "@/features/applications/views/ApplicationDetailView";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ slug: string; clientId: string }> }) {
  const { slug, clientId } = await params;
  return <ApplicationDetailView slug={slug} clientId={clientId} />;
}
