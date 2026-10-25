import { PageFrame } from "@/components/page/PageFrame";
import { ProposedScreenView } from "@/features/capabilities/views/ProposedScreenView";

export default function Page() {
  return (
    <PageFrame size="narrow">
      <ProposedScreenView family="billing" />
    </PageFrame>
  );
}
