"use client";

import { useState } from "react";
import { useAuth } from "@scrolloop/sdk";
import { useCopy } from "@/i18n";
import { errorText } from "@/features/access/api/error-text";
import { useMemberships, useRegisterWorkspace } from "../api/use-workspace";
import { CreateWorkspaceForm } from "../components/CreateWorkspaceForm";
import { WorkspaceChooser } from "../components/WorkspaceChooser";

/** T04: choose an existing workspace or create a new one. Signed-out visitors go straight to creation. */
export function OnboardingView() {
  const { t } = useCopy();
  const { isAuthenticated } = useAuth();
  const [creating, setCreating] = useState(false);
  const memberships = useMemberships(isAuthenticated);
  const register = useRegisterWorkspace();
  const showForm = !isAuthenticated || creating || register.isSuccess;

  return (
    <main id="main-content" className="mx-auto w-full max-w-xl space-y-6 px-4 py-10 sm:px-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t(showForm ? "workspace.create.title" : "workspace.chooser.title")}</h1>
        <p className="font-body text-sm text-muted-foreground">{t(showForm ? "workspace.create.subtitle" : "workspace.chooser.subtitle")}</p>
      </header>
      {showForm ? (
        <CreateWorkspaceForm
          pending={register.isPending}
          created={register.isSuccess}
          error={errorText(register.error)}
          onSubmit={(body) => register.mutate(body)}
          onCancel={isAuthenticated && !register.isSuccess ? () => setCreating(false) : undefined}
        />
      ) : (
        <WorkspaceChooser
          workspaces={memberships.data ?? []}
          status={memberships.isPending ? "loading" : memberships.isError ? "error" : "ready"}
          onRetry={() => void memberships.refetch()}
          onCreate={() => setCreating(true)}
        />
      )}
    </main>
  );
}
