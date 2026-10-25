import { RolesView } from "@/features/access/views/RolesView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RolesView slug={slug} />;
}
