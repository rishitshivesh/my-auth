import { WebhookDeliveriesView } from "@/features/webhooks/views/WebhookDeliveriesView";

export default async function WebhookDeliveriesPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return <WebhookDeliveriesView slug={slug} webhookId={id} />;
}
