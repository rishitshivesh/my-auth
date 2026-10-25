import { ConnectionsOverviewView } from "@/features/connections/views/ConnectionsOverviewView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ConnectionsOverviewView slug={slug} />;
}
