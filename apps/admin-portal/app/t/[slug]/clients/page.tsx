import { ApplicationsListView } from "@/features/applications/views/ApplicationsListView";

export default async function ApplicationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ApplicationsListView slug={slug} />;
}
