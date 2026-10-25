import { PermissionsView } from "@/features/access/views/PermissionsView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PermissionsView slug={slug} />;
}
