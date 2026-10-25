import { DashboardView } from "@/features/dashboard/views/DashboardView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DashboardView slug={slug} />;
}
