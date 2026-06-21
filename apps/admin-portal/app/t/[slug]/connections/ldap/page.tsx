"use client";

import * as React from "react";
import { PortalLayout } from "@/components/layouts/portal-layout";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Badge } from "@repo/ui/components/ui/badge";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Switch } from "@repo/ui/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  useLdapConnections,
  useCreateLdapConnection,
  useDeleteLdapConnection,
  useTestLdapConnection,
  useSyncLdap,
} from "@/lib/queries";
import type { LdapConnection } from "@/lib/types";
import { Network, Plus, MoreHorizontal, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type CreateForm = {
  name: string;
  host: string;
  port: string;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter: string;
  emailAttribute: string;
  useTls: boolean;
  syncSchedule: string;
};

const DEFAULT_FORM: CreateForm = {
  name: "",
  host: "",
  port: "389",
  bindDn: "",
  bindPassword: "",
  baseDn: "",
  userFilter: "(objectClass=person)",
  emailAttribute: "mail",
  useTls: true,
  syncSchedule: "0 */6 * * *",
};

export default function LdapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const { data: connections, isLoading } = useLdapConnections();
  const createConnection = useCreateLdapConnection();
  const deleteConnection = useDeleteLdapConnection();
  const testConnection = useTestLdapConnection();
  const syncNow = useSyncLdap();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState<CreateForm>(DEFAULT_FORM);
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = React.useState<{ id: string; usersCreated: number; usersUpdated: number } | null>(null);

  function setField<K extends keyof CreateForm>(k: K, v: CreateForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleCreate() {
    if (!form.name || !form.host || !form.bindDn || !form.bindPassword || !form.baseDn) return;
    await createConnection.mutateAsync({
      name: form.name,
      host: form.host,
      port: Number(form.port) || 389,
      bindDn: form.bindDn,
      bindPassword: form.bindPassword,
      baseDn: form.baseDn,
      userFilter: form.userFilter,
      emailAttribute: form.emailAttribute,
      useTls: form.useTls,
      syncSchedule: form.syncSchedule,
      active: true,
    });
    setIsCreateOpen(false);
    setForm(DEFAULT_FORM);
  }

  async function handleTest(id: string) {
    const result = await testConnection.mutateAsync(id);
    setTestResult(result);
  }

  async function handleSync(id: string) {
    const result = await syncNow.mutateAsync(id);
    setSyncResult({ id, ...result });
  }

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="LDAP / Active Directory"
      pageSubtitle="Sync users from your directory service"
      currentPath={`/t/${slug}/connections/ldap`}
      primaryAction={{ label: "Add Connection", onClick: () => setIsCreateOpen(true) }}
    >
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 1 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)
        ) : !connections?.length ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-[var(--color-surface-1)] py-16 text-center backdrop-blur-sm">
            <Network className="h-10 w-10 text-[var(--color-text-tertiary)]" />
            <p className="text-[var(--color-text-secondary)]">No LDAP connections configured.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]">
              <Plus className="mr-2 h-4 w-4" /> Add Connection
            </Button>
          </div>
        ) : (
          connections.map((conn: LdapConnection) => (
            <div key={conn.id} className="rounded-2xl bg-[var(--color-surface-1)] backdrop-blur-sm border border-white/20 px-6 py-4">
              <div className="flex items-start gap-4">
                <Network className="h-5 w-5 mt-0.5 shrink-0 text-[var(--color-accent)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-[var(--color-text-primary)]">{conn.name}</p>
                    <Badge variant={conn.active ? "default" : "secondary"} className={conn.active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""}>
                      {conn.active ? "Active" : "Inactive"}
                    </Badge>
                    {conn.useTls && <Badge variant="outline" className="text-xs">TLS</Badge>}
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-[var(--color-text-tertiary)]">
                    {conn.host}:{conn.port} · {conn.baseDn}
                  </p>
                  {conn.lastSyncAt && (
                    <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
                      Last sync: {formatDate(conn.lastSyncAt)}
                      {conn.lastSyncStatus && (
                        <span className={`ml-2 ${conn.lastSyncStatus === "success" ? "text-[var(--color-accent)]" : "text-[var(--color-danger)]"}`}>
                          {conn.lastSyncStatus}
                        </span>
                      )}
                      {conn.lastSyncUsersCreated != null && (
                        <span className="ml-2">+{conn.lastSyncUsersCreated} created, {conn.lastSyncUsersUpdated} updated</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(conn.id)}
                    disabled={testConnection.isPending}
                  >
                    {testConnection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(conn.id)}
                    disabled={syncNow.isPending}
                  >
                    {syncNow.isPending && syncResult?.id === conn.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Sync
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteConnection.mutate(conn.id)}
                        className="text-[var(--color-danger)]"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add LDAP Connection</DialogTitle>
            <DialogDescription>Connect to your directory server to sync users automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Connection Name</Label>
              <Input placeholder="Corporate AD" value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Host</Label>
                <Input placeholder="ldap.corp.example.com" value={form.host} onChange={(e) => setField("host", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input type="number" value={form.port} onChange={(e) => setField("port", e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.useTls} onCheckedChange={(v) => setField("useTls", v)} />
              <Label>Use TLS / LDAPS</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Bind DN</Label>
              <Input placeholder="cn=svc-account,dc=corp,dc=example,dc=com" value={form.bindDn} onChange={(e) => setField("bindDn", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bind Password</Label>
              <Input type="password" value={form.bindPassword} onChange={(e) => setField("bindPassword", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Base DN</Label>
              <Input placeholder="dc=corp,dc=example,dc=com" value={form.baseDn} onChange={(e) => setField("baseDn", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>User Filter</Label>
              <Input value={form.userFilter} onChange={(e) => setField("userFilter", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email Attribute</Label>
              <Input value={form.emailAttribute} onChange={(e) => setField("emailAttribute", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sync Schedule (cron)</Label>
              <Input value={form.syncSchedule} onChange={(e) => setField("syncSchedule", e.target.value)} />
              <p className="text-xs text-[var(--color-text-tertiary)]">Default: every 6 hours</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || !form.host || !form.bindDn || !form.bindPassword || !form.baseDn || createConnection.isPending}
              className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]"
            >
              {createConnection.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Result Dialog */}
      <Dialog open={!!testResult} onOpenChange={() => setTestResult(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testResult?.success
                ? <CheckCircle2 className="h-5 w-5 text-[var(--color-accent)]" />
                : <XCircle className="h-5 w-5 text-[var(--color-danger)]" />
              }
              {testResult?.success ? "Connection Successful" : "Connection Failed"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--color-text-secondary)]">{testResult?.message}</p>
          <DialogFooter>
            <Button onClick={() => setTestResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Result Dialog */}
      <Dialog open={!!syncResult} onOpenChange={() => setSyncResult(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[var(--color-accent)]" />
              Sync Complete
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2 text-center">
            <div className="rounded-xl bg-[var(--color-surface-2)] py-3">
              <p className="text-2xl font-semibold text-[var(--color-accent)]">{syncResult?.usersCreated ?? 0}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">Created</p>
            </div>
            <div className="rounded-xl bg-[var(--color-surface-2)] py-3">
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{syncResult?.usersUpdated ?? 0}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">Updated</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSyncResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
