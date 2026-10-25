import { SentrySkeleton } from "@repo/ui";

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6" aria-busy="true">
      <SentrySkeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-3">
        <SentrySkeleton className="h-28 rounded-xl" />
        <SentrySkeleton className="h-28 rounded-xl" />
        <SentrySkeleton className="h-28 rounded-xl" />
      </div>
      <SentrySkeleton className="h-72 rounded-xl" />
    </div>
  );
}
