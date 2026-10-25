import { PeopleView } from "@/features/users/views/PeopleView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PeopleView slug={slug} />;
}
