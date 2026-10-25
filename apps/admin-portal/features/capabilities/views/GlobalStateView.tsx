"use client";

import Link from "next/link";
import { StateView, type StateKind } from "@repo/ui";
import { accountRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";

type GlobalStateKind = Extract<StateKind, "error" | "denied" | "not-found" | "unavailable">;

const COPY_KEYS = {
  error: "error",
  denied: "denied",
  "not-found": "notFound",
  unavailable: "unavailable",
} as const satisfies Record<GlobalStateKind, string>;

export interface GlobalStateViewProps {
  kind: GlobalStateKind;
  /** Retry handler (error boundaries pass Next's reset). */
  onRetry?: () => void;
  /** Support reference such as the error digest. */
  reference?: string;
}

/** Full-page state for not found, denied, unavailable and boundary errors. */
export function GlobalStateView({ kind, onRetry, reference }: GlobalStateViewProps) {
  const { t } = useCopy();
  const key = COPY_KEYS[kind];
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-card">
        <StateView
          kind={kind}
          title={t(`states.${key}.title`)}
          description={t(`states.${key}.description`)}
          reference={reference}
          action={onRetry ? { label: t("common.actions.retry"), onClick: onRetry } : undefined}
        />
        <p className="pb-6 text-center font-body text-sm">
          <Link href={accountRoutes.overview()} className="text-accent underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            {t("capabilities.common.home")}
          </Link>
        </p>
      </div>
    </main>
  );
}
