import { ScimView } from "@/features/connections/views/ScimView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ScimView slug={slug} />;
}
