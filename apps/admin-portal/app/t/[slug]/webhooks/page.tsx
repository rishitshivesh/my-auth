import { WebhooksView } from "@/features/webhooks/views/WebhooksView";

export default async function WebhooksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <WebhooksView slug={slug} />;
}
