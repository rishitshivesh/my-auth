"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog, SentryButton, StateView } from "@repo/ui";
import { tenantRoutes } from "@/constants/routes";
import { usePermission } from "@/hooks/use-permission";
import { useConfirmFlow } from "@/features/applications/components/useConfirmFlow";
import { isNotFound, resourceStatus } from "@/features/applications/model/resource-status";
import { useCopy } from "@/i18n";
import { useRedeliver, useWebhook, useWebhookDeliveries } from "../api/webhooks";
import { DeliveriesTable } from "../components/DeliveriesTable";
import type { WebhookDelivery } from "../model/types";
import { DELIVERY_LIMIT, canRedeliver } from "../model/webhooks";
import { PageFrame } from "@/components/page/PageFrame";

export function WebhookDeliveriesView({ slug, webhookId }: { slug: string; webhookId: string }) {
  const { t } = useCopy();
  const router = useRouter();
  const { can, isReady } = usePermission();
  const endpoint = useWebhook(slug, webhookId);
  const deliveries = useWebhookDeliveries(slug, webhookId);
  const redeliver = useRedeliver(slug, webhookId);
  const canWrite = !isReady || can("webhooks:write");
  const back = () => router.push(tenantRoutes(slug).webhooks());

  const flow = useConfirmFlow(
    (delivery: WebhookDelivery) => redeliver.mutateAsync(delivery.id),
    () => toast.success(t("tenantIntegrations.webhooks.diagnostics.redeliverQueued")),
  );
  const rows = useMemo(() => (deliveries.data ?? []).map((d) => ({ ...d, name: d.eventType })), [deliveries.data]);
  const d = "tenantIntegrations.webhooks.diagnostics" as const;

  return (
    <PageFrame title={t(`${d}.title`)}
      subtitle={endpoint.data ? t(`${d}.subtitle`, { url: endpoint.data.url }) : undefined}
      action={<SentryButton variant="ghost" onClick={back}>{t(`${d}.back`)}</SentryButton>}
    >
      {endpoint.isError && isNotFound(endpoint.error) ? (
        <StateView kind="not-found" title={t(`${d}.notFoundTitle`)} action={{ label: t(`${d}.back`), onClick: back }} />
      ) : (
        <>
          <DeliveriesTable
            rows={rows}
            status={resourceStatus(deliveries)}
            onRetry={() => void deliveries.refetch()}
            actions={canWrite ? (row) => (canRedeliver(row.status) ? [{ id: "redeliver", label: t(`${d}.redeliver`), onSelect: () => flow.request(row) }] : []) : undefined}
          />
          {rows.length > 0 && <p className="font-body text-xs text-muted-foreground">{t(`${d}.limitNote`, { count: DELIVERY_LIMIT })}</p>}
        </>
      )}
      <ConfirmDialog
        open={flow.open}
        onOpenChange={(open) => { if (!open) flow.cancel(); }}
        title={t(`${d}.redeliverTitle`)}
        description={t(`${d}.redeliverDescription`)}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t(`${d}.redeliverEffect1`)]}
        confirmLabel={t(`${d}.redeliverConfirm`)}
        cancelLabel={t("common.actions.cancel")}
        onConfirm={flow.confirm}
        pending={flow.pending}
        error={flow.error}
      />
    </PageFrame>
  );
}
