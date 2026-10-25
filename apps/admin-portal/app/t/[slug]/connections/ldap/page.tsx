import { LdapView } from "@/features/connections/views/LdapView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LdapView slug={slug} />;
}
