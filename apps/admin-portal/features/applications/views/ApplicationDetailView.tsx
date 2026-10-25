"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog, SentryButton, StateView, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { tenantRoutes } from "@/constants/routes";
import { usePermission } from "@/hooks/use-permission";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useClient, useDeleteClient } from "../api/clients";
import { ClientCredentialsPanel } from "../components/ClientCredentialsPanel";
import { ClientSettingsForm } from "../components/ClientSettingsForm";
import { isNotFound } from "../model/resource-status";
import { PageFrame } from "@/components/page/PageFrame";

export function ApplicationDetailView({ slug, clientId }: { slug: string; clientId: string }) {
  const { t } = useCopy();
  const router = useRouter();
  const { can, isReady } = usePermission();
  const query = useClient(slug, clientId);
  const remove = useDeleteClient(slug, clientId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();

  const allowed = (permission: string) => !isReady || can(permission);
  const back = () => router.push(tenantRoutes(slug).applications());

  const onDelete = async () => {
    setError(undefined);
    try {
      await remove.mutateAsync();
      toast.success(t("tenantIntegrations.apps.detail.deleted"));
      back();
    } catch (failure: unknown) {
      setError(describeError(failure).message);
    }
  };

  const client = query.data;
  const title = client?.name ?? t("tenantIntegrations.apps.title");

  return (
    <PageFrame title={title}
      action={<SentryButton variant="ghost" onClick={back}>{t("tenantIntegrations.apps.detail.backToList")}</SentryButton>}
    >
      {query.isPending && <StateView kind="loading" title={t("tenantIntegrations.apps.loading")} />}
      {query.isError && isNotFound(query.error) && (
        <StateView
          kind="not-found"
          title={t("tenantIntegrations.apps.detail.notFoundTitle")}
          description={t("tenantIntegrations.apps.detail.notFoundDescription")}
          action={{ label: t("tenantIntegrations.apps.detail.backToList"), onClick: back }}
        />
      )}
      {query.isError && !isNotFound(query.error) && (
        <StateView
          kind="error"
          title={t("tenantIntegrations.common.errorTitle")}
          description={t("tenantIntegrations.common.errorDescription")}
          action={{ label: t("common.actions.retry"), onClick: () => void query.refetch() }}
        />
      )}
      {client && (
        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settings">{t("tenantIntegrations.apps.detail.tabSettings")}</TabsTrigger>
            <TabsTrigger value="credentials">{t("tenantIntegrations.apps.detail.tabCredentials")}</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="space-y-6">
            <ClientSettingsForm slug={slug} client={client} canWrite={allowed("clients:write")} />
            {allowed("clients:delete") && (
              <section aria-labelledby="client-danger-heading" className="space-y-2 rounded-md border border-destructive/40 p-6">
                <h2 id="client-danger-heading" className="font-display text-base font-semibold text-destructive">{t("tenantIntegrations.apps.detail.danger")}</h2>
                <p className="font-body text-sm text-muted-foreground">{t("tenantIntegrations.apps.detail.dangerDescription")}</p>
                <SentryButton variant="destructive" onClick={() => setConfirmOpen(true)}>{t("tenantIntegrations.apps.detail.danger")}</SentryButton>
              </section>
            )}
          </TabsContent>
          <TabsContent value="credentials">
            <ClientCredentialsPanel slug={slug} client={client} canRotate={allowed("clients:write")} />
          </TabsContent>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={(open) => { setConfirmOpen(open); if (!open) setError(undefined); }}
            title={t("tenantIntegrations.apps.detail.deleteConfirmTitle", { name: client.name })}
            description={t("tenantIntegrations.apps.detail.deleteConfirmDescription")}
            effectsHeading={t("common.dialog.effectHeading")}
            effects={[
              t("tenantIntegrations.apps.detail.deleteEffect1"),
              t("tenantIntegrations.apps.detail.deleteEffect2"),
              t("tenantIntegrations.apps.detail.deleteEffect3"),
            ]}
            confirmLabel={t("tenantIntegrations.apps.detail.deleteConfirm")}
            cancelLabel={t("common.actions.cancel")}
            destructive
            confirmPhrase={client.name}
            confirmPhraseLabel={t("common.dialog.typeToConfirm", { phrase: client.name })}
            onConfirm={onDelete}
            pending={remove.isPending}
            error={error}
          />
        </Tabs>
      )}
    </PageFrame>
  );
}
