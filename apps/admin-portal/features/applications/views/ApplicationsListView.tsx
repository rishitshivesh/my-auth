"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SentryButton } from "@repo/ui";
import { tenantRoutes } from "@/constants/routes";
import { usePermission } from "@/hooks/use-permission";
import { useCopy } from "@/i18n";
import { useClients } from "../api/clients";
import { ClientsTable } from "../components/ClientsTable";
import { CreateApplicationDialog } from "../components/CreateApplicationDialog";
import { CreatedCredentialsDialog } from "../components/CreatedCredentialsDialog";
import { filterClients } from "../model/clients";
import { resourceStatus } from "../model/resource-status";
import type { CreatedOAuthClient } from "../model/types";
import { PageFrame } from "@/components/page/PageFrame";

export function ApplicationsListView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const router = useRouter();
  const { can, isReady } = usePermission();
  const query = useClients(slug);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedOAuthClient | null>(null);

  const rows = useMemo(() => filterClients(query.data ?? [], search), [query.data, search]);
  const canCreate = !isReady || can("clients:write");
  const open = (clientId: string) => router.push(tenantRoutes(slug).application(clientId));

  return (
    <PageFrame title={t("tenantIntegrations.apps.title")}
      subtitle={t("tenantIntegrations.apps.subtitle")}
      action={
        canCreate ? (
          <SentryButton variant="primary" onClick={() => setCreateOpen(true)}>{t("tenantIntegrations.apps.add")}</SentryButton>
        ) : undefined
      }
    >
      <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.apps.inactiveNote")}</p>
      <ClientsTable
        clients={rows}
        status={resourceStatus(query)}
        search={search}
        onSearchChange={setSearch}
        onRetry={() => void query.refetch()}
        onOpen={(client) => open(client.clientId)}
        onCreate={canCreate ? () => setCreateOpen(true) : undefined}
      />
      <CreateApplicationDialog slug={slug} open={createOpen} onOpenChange={setCreateOpen} onCreated={setCreated} />
      <CreatedCredentialsDialog
        created={created}
        onDone={() => {
          const next = created;
          setCreated(null);
          if (next) open(next.clientId);
        }}
      />
    </PageFrame>
  );
}
