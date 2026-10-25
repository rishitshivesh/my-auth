"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader, SentryButton, StateView } from "@repo/ui";
import { authRoutes, platformRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { useCreateFirstAdmin, usePlatformInfo } from "../api/setup";
import { SetupForm } from "../components/SetupForm";
import { classifySetupError, type SetupOutcome } from "../model/setup";

export function SetupView() {
  const { t } = useCopy();
  const info = usePlatformInfo();
  const create = useCreateFirstAdmin();
  const [outcome, setOutcome] = useState<SetupOutcome | null>(null);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 py-10">
      <PageHeader title={t("platform.setup.title")} subtitle={t("platform.setup.subtitle")} className="mb-0" />
      {children}
    </main>
  );

  if (create.isSuccess) {
    return shell(
      <StateView
        kind="empty"
        title={t("platform.setup.success.title")}
        description={t("platform.setup.success.body")}
        action={{ label: t("platform.setup.success.action"), onClick: () => window.location.assign(platformRoutes.dashboard()) }}
      />,
    );
  }
  if (info.isPending) return shell(<StateView kind="loading" title={t("platform.setup.checking")} />);
  if (info.isError) {
    return shell(
      <StateView
        kind="unavailable"
        title={t("platform.setup.unavailable.title")}
        description={t("platform.setup.unavailable.body")}
        action={{ label: t("platform.common.retry"), onClick: () => { void info.refetch(); } }}
      />,
    );
  }
  if (info.data.initialized || outcome === "initialized") {
    return shell(
      <div className="space-y-4 text-center">
        <StateView kind="denied" title={t("platform.setup.initialized.title")} description={t("platform.setup.initialized.body")} />
        <SentryButton asChild><Link href={authRoutes.login()}>{t("platform.setup.initialized.action")}</Link></SentryButton>
      </div>,
    );
  }
  const failure = outcome ? t(`platform.setup.outcome.${outcome}`) : undefined;
  return shell(
    <SetupForm
      pending={create.isPending}
      failure={failure}
      onSubmit={(draft) => {
        setOutcome(null);
        create.mutate(draft, { onError: (error) => setOutcome(classifySetupError(error)) });
      }}
    />,
  );
}
