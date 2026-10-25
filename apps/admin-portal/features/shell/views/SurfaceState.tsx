"use client";

import { StateView, type StateKind } from "@repo/ui";
import { useCopy } from "@/i18n";

/** Centered full-area state shown by the console frames before the shell mounts. */
export function SurfaceState({
  kind, title, description, action,
}: {
  kind: StateKind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-card">
        <StateView kind={kind} title={title} description={description} action={action} />
      </div>
    </main>
  );
}

/** Loading placeholder used while the session is being resolved or the redirect to login runs. */
export function SurfaceLoading() {
  const { t } = useCopy();
  return <SurfaceState kind="loading" title={t("states.loading.title")} description={t("states.loading.description")} />;
}
