import { PoliciesView } from "@/features/access/views/PoliciesView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PoliciesView slug={slug} />;
}
