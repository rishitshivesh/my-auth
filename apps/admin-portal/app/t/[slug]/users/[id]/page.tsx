import { PersonDetailView } from "@/features/users/views/PersonDetailView";

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return <PersonDetailView slug={slug} userId={id} />;
}
