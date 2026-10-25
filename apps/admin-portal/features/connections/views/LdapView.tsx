"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, SentryButton } from "@repo/ui";
import { usePermission } from "@/hooks/use-permission";
import { useConfirmFlow } from "@/features/applications/components/useConfirmFlow";
import { resourceStatus } from "@/features/applications/model/resource-status";
import { toastApiError } from "@/lib/with-error-handler";
import { useCopy } from "@/i18n";
import { useLdapConnections, useLdapMutations } from "../api/connections";
import { CreateLdapDialog } from "../components/CreateLdapDialog";
import { LdapNetworkNotice } from "../components/LdapNetworkNotice";
import { LdapTable } from "../components/LdapTable";
import { filterLdap } from "../model/ldap";
import type { LdapConnection } from "../model/types";
import { PageFrame } from "@/components/page/PageFrame";

interface Outcome {
  ok: boolean;
  text: string;
}

export function LdapView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const { can, isReady } = usePermission();
  const query = useLdapConnections(slug);
  const { remove, setActive, test, sync } = useLdapMutations(slug);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const canWrite = !isReady || can("ldap:write");
  const canRead = !isReady || can("ldap:read");

  const flow = useConfirmFlow(
    (conn: LdapConnection) => remove.mutateAsync(conn.id),
    () => toast.success(t("tenantIntegrations.ldap.deleted")),
  );

  const run = async (action: () => Promise<Outcome>) => {
    try {
      setOutcome(await action());
    } catch (error: unknown) {
      toastApiError(error);
    }
  };
  const onTest = (conn: LdapConnection) => run(async () => {
    const result = await test.mutateAsync(conn.id);
    return { ok: result.success, text: `${t(result.success ? "tenantIntegrations.ldap.testOk" : "tenantIntegrations.ldap.testFailed")}: ${result.message}` };
  });
  const onSync = (conn: LdapConnection) => run(async () => {
    await sync.mutateAsync(conn.id);
    return { ok: true, text: t("tenantIntegrations.ldap.syncQueued") };
  });
  const onToggle = (conn: LdapConnection) => run(async () => {
    await setActive.mutateAsync({ id: conn.id, active: !conn.active });
    return { ok: true, text: t("tenantIntegrations.ldap.toggled") };
  });

  const rows = useMemo(() => filterLdap(query.data ?? [], search), [query.data, search]);

  return (
    <PageFrame title={t("tenantIntegrations.ldap.title")}
      subtitle={t("tenantIntegrations.ldap.subtitle")}
      action={canWrite ? <SentryButton variant="primary" onClick={() => setAddOpen(true)}>{t("tenantIntegrations.ldap.add")}</SentryButton> : undefined}
    >
      <LdapNetworkNotice />
      <p role="status" aria-live="polite" className={outcome?.ok === false ? "font-body text-sm text-destructive" : "font-body text-sm text-foreground"}>
        {outcome?.text}
      </p>
      <LdapTable
        rows={rows}
        status={resourceStatus(query)}
        search={search}
        onSearchChange={setSearch}
        onRetry={() => void query.refetch()}
        onAdd={canWrite ? () => setAddOpen(true) : undefined}
        actions={(row) => [
          ...(canRead ? [{ id: "test", label: t("tenantIntegrations.ldap.test"), onSelect: () => void onTest(row) }] : []),
          ...(canWrite ? [
            { id: "sync", label: t("tenantIntegrations.ldap.sync"), disabled: !row.active, onSelect: () => void onSync(row) },
            { id: "toggle", label: t(row.active ? "tenantIntegrations.ldap.deactivate" : "tenantIntegrations.ldap.activate"), onSelect: () => void onToggle(row) },
            { id: "delete", label: t("tenantIntegrations.common.deleteAction"), destructive: true, onSelect: () => flow.request(row) },
          ] : []),
        ]}
      />
      <CreateLdapDialog slug={slug} open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={flow.open}
        onOpenChange={(open) => { if (!open) flow.cancel(); }}
        title={t("tenantIntegrations.ldap.deleteTitle", { name: flow.target?.name ?? "" })}
        description={t("tenantIntegrations.ldap.deleteDescription")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[t("tenantIntegrations.ldap.deleteEffect1"), t("tenantIntegrations.ldap.deleteEffect2")]}
        confirmLabel={t("tenantIntegrations.ldap.deleteConfirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        onConfirm={flow.confirm}
        pending={flow.pending}
        error={flow.error}
      />
    </PageFrame>
  );
}
