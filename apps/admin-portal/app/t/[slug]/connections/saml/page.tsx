import { SamlView } from "@/features/connections/views/SamlView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SamlView slug={slug} />;
}
