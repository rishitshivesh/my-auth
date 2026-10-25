import { SimulatorView } from "@/features/access/views/SimulatorView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SimulatorView slug={slug} />;
}
