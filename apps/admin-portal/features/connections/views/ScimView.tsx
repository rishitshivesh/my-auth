"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, SentryButton } from "@repo/ui";
import { usePermission } from "@/hooks/use-permission";
import { apiBaseUrl } from "@/features/applications/api/request";
import { EndpointsPanel } from "@/features/applications/components/EndpointsPanel";
import { OneTimeSecretDialog } from "@/features/applications/components/OneTimeSecretDialog";
import { useConfirmFlow } from "@/features/applications/components/useConfirmFlow";
import { scimBaseUrl } from "@/features/applications/model/endpoints";
import { formatDate } from "@/features/applications/model/format";
import { resourceStatus } from "@/features/applications/model/resource-status";
import { useCopy } from "@/i18n";
import { useScimMutations, useScimTokens } from "../api/connections";
import { CreateScimTokenDialog } from "../components/CreateScimTokenDialog";
import { ScimTokensTable } from "../components/ScimTokensTable";
import { filterScimTokens } from "../model/scim";
import type { ScimTokenRecord } from "../model/types";
import { PageFrame } from "@/components/page/PageFrame";

export function ScimView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const query = useScimTokens(slug);
  const { revoke } = useScimMutations(slug);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const canWrite = !isReady || can("scim:write");

  const flow = useConfirmFlow(
    (token: ScimTokenRecord) => revoke.mutateAsync(token.id),
    () => toast.success(t("tenantIntegrations.scim.revoked")),
  );
  const rows = useMemo(() => filterScimTokens(query.data ?? [], search), [query.data, search]);

  return (
    <PageFrame title={t("tenantIntegrations.scim.title")}
      subtitle={t("tenantIntegrations.scim.subtitle")}
      action={canWrite ? <SentryButton variant="primary" onClick={() => setAddOpen(true)}>{t("tenantIntegrations.scim.add")}</SentryButton> : undefined}
    >
      <EndpointsPanel
        heading={t("tenantIntegrations.scim.setupHeading")}
        items={[{ id: "scim-base", label: t("tenantIntegrations.endpoints.scimBase"), value: scimBaseUrl(apiBaseUrl()) }]}
        note={t("tenantIntegrations.scim.setupNote")}
      />
      {/* TODO(gap:N09-provisioning-history): no endpoint exposes per-run SCIM provisioning history or failures. */}
      <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.scim.operationsGap")}</p>
      <ScimTokensTable
        rows={rows}
        status={resourceStatus(query)}
        search={search}
        onSearchChange={setSearch}
        onRetry={() => void query.refetch()}
        onAdd={canWrite ? () => setAddOpen(true) : undefined}
        formatDate={formatDate}
        actions={canWrite ? (row) => [
          { id: "revoke", label: t("tenantIntegrations.common.revokeAction"), destructive: true, onSelect: () => flow.request(row) },
        ] : undefined}
      />
      <CreateScimTokenDialog slug={slug} open={addOpen} onOpenChange={setAddOpen} onCreated={(created) => setSecret(created.token)} />
      {secret !== null && (
        <OneTimeSecretDialog
          open
          title={t("tenantIntegrations.scim.secretTitle")}
          description={t("tenantIntegrations.scim.secretDescription")}
          secret={secret}
          onAcknowledge={() => setSecret(null)}
        />
      )}
      <ConfirmDialog
        open={flow.open}
        onOpenChange={(open) => { if (!open) flow.cancel(); }}
        title={t("tenantIntegrations.scim.revokeTitle", { name: flow.target?.name ?? "" })}
        description={t("tenantIntegrations.scim.revokeDescription")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("tenantIntegrations.scim.revokeEffect1"), t("tenantIntegrations.scim.revokeEffect2")]}
        confirmLabel={t("tenantIntegrations.scim.revokeConfirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        onConfirm={flow.confirm}
        pending={flow.pending}
        error={flow.error}
      />
    </PageFrame>
  );
}
