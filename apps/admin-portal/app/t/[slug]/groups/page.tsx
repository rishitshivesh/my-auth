import { GroupsView } from "@/features/access/views/GroupsView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GroupsView slug={slug} />;
}
