"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog, SentryButton } from "@repo/ui";
import { tenantRoutes } from "@/constants/routes";
import { usePermission } from "@/hooks/use-permission";
import { OneTimeSecretDialog } from "@/features/applications/components/OneTimeSecretDialog";
import { useConfirmFlow } from "@/features/applications/components/useConfirmFlow";
import { resourceStatus } from "@/features/applications/model/resource-status";
import { toastApiError } from "@/lib/with-error-handler";
import { useCopy } from "@/i18n";
import { useWebhookMutations, useWebhooks } from "../api/webhooks";
import { CreateWebhookDialog } from "../components/CreateWebhookDialog";
import { WebhooksTable } from "../components/WebhooksTable";
import { filterWebhooks, toRows, type WebhookRow } from "../model/webhooks";
import { PageFrame } from "@/components/page/PageFrame";

export function WebhooksView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const router = useRouter();
  const { can, isReady } = usePermission();
  const query = useWebhooks(slug);
  const { remove, rotate, setActive, test } = useWebhookMutations(slug);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const canWrite = !isReady || can("webhooks:write");

  const removeFlow = useConfirmFlow(
    (row: WebhookRow) => remove.mutateAsync(row.id),
    () => toast.success(t("tenantIntegrations.webhooks.deleted")),
  );
  const rotateFlow = useConfirmFlow(
    async (row: WebhookRow) => setSecret((await rotate.mutateAsync(row.id)).secret),
  );

  const attempt = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (error: unknown) {
      toastApiError(error);
    }
  };

  const rows = useMemo(() => filterWebhooks(toRows(query.data ?? []), search), [query.data, search]);

  return (
    <PageFrame title={t("tenantIntegrations.webhooks.title")}
      subtitle={t("tenantIntegrations.webhooks.subtitle")}
      action={canWrite ? <SentryButton variant="primary" onClick={() => setAddOpen(true)}>{t("tenantIntegrations.webhooks.add")}</SentryButton> : undefined}
    >
      <WebhooksTable
        rows={rows}
        status={resourceStatus(query)}
        search={search}
        onSearchChange={setSearch}
        onRetry={() => void query.refetch()}
        onAdd={canWrite ? () => setAddOpen(true) : undefined}
        actions={(row) => [
          { id: "deliveries", label: t("tenantIntegrations.webhooks.deliveries"), onSelect: () => router.push(tenantRoutes(slug).webhookDeliveries(row.id)) },
          ...(canWrite ? [
            { id: "test", label: t("tenantIntegrations.webhooks.test"), onSelect: () => void attempt(() => test.mutateAsync(row.id), t("tenantIntegrations.webhooks.testSent")) },
            { id: "toggle", label: t(row.active ? "tenantIntegrations.webhooks.deactivate" : "tenantIntegrations.webhooks.activate"), onSelect: () => void attempt(() => setActive.mutateAsync({ id: row.id, active: !row.active }), t("tenantIntegrations.webhooks.toggled")) },
            { id: "rotate", label: t("tenantIntegrations.webhooks.rotate"), onSelect: () => rotateFlow.request(row) },
            { id: "delete", label: t("tenantIntegrations.common.deleteAction"), destructive: true, onSelect: () => removeFlow.request(row) },
          ] : []),
        ]}
      />
      <CreateWebhookDialog slug={slug} open={addOpen} onOpenChange={setAddOpen} onCreated={(endpoint) => setSecret(endpoint.secret ?? null)} />
      {secret !== null && (
        <OneTimeSecretDialog
          open
          title={t("tenantIntegrations.webhooks.secretTitle")}
          description={t("tenantIntegrations.webhooks.secretDescription")}
          secret={secret}
          footnote={t("tenantIntegrations.webhooks.secretCreatedNote")}
          onAcknowledge={() => setSecret(null)}
        />
      )}
      <ConfirmDialog
        open={rotateFlow.open}
        onOpenChange={(open) => { if (!open) rotateFlow.cancel(); }}
        title={t("tenantIntegrations.webhooks.rotateTitle")}
        description={t("tenantIntegrations.webhooks.rotateDescription")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("tenantIntegrations.webhooks.rotateEffect1"), t("tenantIntegrations.webhooks.rotateEffect2")]}
        confirmLabel={t("tenantIntegrations.webhooks.rotateConfirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        onConfirm={rotateFlow.confirm}
        pending={rotateFlow.pending}
        error={rotateFlow.error}
      />
      <ConfirmDialog
        open={removeFlow.open}
        onOpenChange={(open) => { if (!open) removeFlow.cancel(); }}
        title={t("tenantIntegrations.webhooks.deleteTitle")}
        description={t("tenantIntegrations.webhooks.deleteDescription")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("tenantIntegrations.webhooks.deleteEffect1"), t("tenantIntegrations.webhooks.deleteEffect2")]}
        confirmLabel={t("tenantIntegrations.webhooks.deleteConfirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        onConfirm={removeFlow.confirm}
        pending={removeFlow.pending}
        error={removeFlow.error}
      />
    </PageFrame>
  );
}
