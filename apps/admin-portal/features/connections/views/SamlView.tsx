"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, SentryButton } from "@repo/ui";
import { usePermission } from "@/hooks/use-permission";
import { apiBaseUrl } from "@/features/applications/api/request";
import { EndpointsPanel } from "@/features/applications/components/EndpointsPanel";
import { useConfirmFlow } from "@/features/applications/components/useConfirmFlow";
import { samlMetadataUrl } from "@/features/applications/model/endpoints";
import { resourceStatus } from "@/features/applications/model/resource-status";
import { toastApiError } from "@/lib/with-error-handler";
import { useCopy } from "@/i18n";
import { useSamlMutations, useSamlProviders } from "../api/connections";
import { RegisterSamlDialog } from "../components/RegisterSamlDialog";
import { SamlTable } from "../components/SamlTable";
import { filterSamlProviders } from "../model/saml";
import type { SamlServiceProvider } from "../model/types";
import { PageFrame } from "@/components/page/PageFrame";

export function SamlView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const query = useSamlProviders(slug);
  const { remove, setActive } = useSamlMutations(slug);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const canWrite = !isReady || can("saml:write");

  const flow = useConfirmFlow(
    (sp: SamlServiceProvider) => remove.mutateAsync(sp.id),
    () => toast.success(t("tenantIntegrations.saml.deleted")),
  );
  const toggle = async (sp: SamlServiceProvider) => {
    try {
      await setActive.mutateAsync({ id: sp.id, active: !sp.active });
      toast.success(t("tenantIntegrations.saml.toggled"));
    } catch (error: unknown) {
      toastApiError(error);
    }
  };

  const rows = useMemo(() => filterSamlProviders(query.data ?? [], search), [query.data, search]);
  const name = flow.target?.name ?? "";

  return (
    <PageFrame title={t("tenantIntegrations.saml.title")}
      subtitle={t("tenantIntegrations.saml.subtitle")}
      action={canWrite ? <SentryButton variant="primary" onClick={() => setAddOpen(true)}>{t("tenantIntegrations.saml.add")}</SentryButton> : undefined}
    >
      <EndpointsPanel
        heading={t("tenantIntegrations.saml.metadataHeading")}
        items={[{ id: "metadata", label: t("tenantIntegrations.endpoints.samlMetadata"), value: samlMetadataUrl(apiBaseUrl(), slug) }]}
      />
      <SamlTable
        rows={rows}
        status={resourceStatus(query)}
        search={search}
        onSearchChange={setSearch}
        onRetry={() => void query.refetch()}
        onAdd={canWrite ? () => setAddOpen(true) : undefined}
        actions={canWrite ? (row) => [
          { id: "toggle", label: t(row.active ? "tenantIntegrations.saml.deactivate" : "tenantIntegrations.saml.activate"), onSelect: () => void toggle(row) },
          { id: "delete", label: t("tenantIntegrations.common.deleteAction"), destructive: true, onSelect: () => flow.request(row) },
        ] : undefined}
      />
      <RegisterSamlDialog slug={slug} open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={flow.open}
        onOpenChange={(open) => { if (!open) flow.cancel(); }}
        title={t("tenantIntegrations.saml.deleteTitle", { name })}
        description={t("tenantIntegrations.saml.deleteDescription")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("tenantIntegrations.saml.deleteEffect1"), t("tenantIntegrations.saml.deleteEffect2")]}
        confirmLabel={t("tenantIntegrations.saml.deleteConfirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        onConfirm={flow.confirm}
        pending={flow.pending}
        error={flow.error}
      />
    </PageFrame>
  );
}
