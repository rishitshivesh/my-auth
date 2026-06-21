"use client";

import * as React from "react";
import { PortalLayout } from "@/components/layouts/portal-layout";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Badge } from "@repo/ui/components/ui/badge";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
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
  useWebhooks,
  useWebhookDeliveries,
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useRotateWebhookSecret,
} from "@/lib/queries";
import type { WebhookEndpoint, WebhookDelivery } from "@/lib/types";
import {
  Webhook,
  Plus,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

const ALL_EVENTS = [
  "user.created",
  "user.updated",
  "user.deleted",
  "session.created",
  "session.revoked",
  "mfa.enrolled",
  "mfa.disabled",
  "oauth.token.issued",
  "*",
];

function deliveryStatusIcon(status: WebhookDelivery["status"]) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-[var(--color-danger)]" />;
    case "retrying":
      return <AlertCircle className="h-4 w-4 text-[var(--color-warning)]" />;
    default:
      return <Clock className="h-4 w-4 text-[var(--color-text-tertiary)]" />;
  }
}

function DeliveryPanel({ endpoint }: { endpoint: WebhookEndpoint }) {
  const { data: deliveries, isLoading } = useWebhookDeliveries(endpoint.id);

  return (
    <div className="mt-4 space-y-2">
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)
      ) : !deliveries?.length ? (
        <p className="py-4 text-center text-sm text-[var(--color-text-tertiary)]">No deliveries yet</p>
      ) : (
        deliveries.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-2)] px-4 py-2 text-sm"
          >
            {deliveryStatusIcon(d.status)}
            <span className="flex-1 font-mono text-xs text-[var(--color-text-secondary)]">{d.eventType}</span>
            {d.responseStatus && (
              <Badge variant="outline" className="font-mono text-xs">
                {d.responseStatus}
              </Badge>
            )}
            <span className="text-[var(--color-text-tertiary)] text-xs">
              {d.durationMs != null ? `${d.durationMs}ms` : "—"}
            </span>
            <span className="text-[var(--color-text-tertiary)] text-xs">
              {new Date(d.createdAt).toLocaleString()}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default function WebhooksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const { data: webhooks, isLoading } = useWebhooks();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();
  const rotateSecret = useRotateWebhookSecret();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedEvents, setSelectedEvents] = React.useState<string[]>(["*"]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = React.useState<{ id: string; secret: string } | null>(null);

  function toggleEvent(ev: string) {
    if (ev === "*") {
      setSelectedEvents(["*"]);
      return;
    }
    setSelectedEvents((prev) => {
      const without = prev.filter((e) => e !== "*");
      return without.includes(ev) ? without.filter((e) => e !== ev) : [...without, ev];
    });
  }

  async function handleCreate() {
    if (!url || selectedEvents.length === 0) return;
    await createWebhook.mutateAsync({ url, events: selectedEvents, description: description || undefined });
    setIsCreateOpen(false);
    setUrl("");
    setDescription("");
    setSelectedEvents(["*"]);
  }

  async function handleRotate(id: string) {
    const result = await rotateSecret.mutateAsync(id);
    setRotatedSecret({ id, secret: result.secret });
  }

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="Webhooks"
      pageSubtitle="Send real-time events to your endpoints"
      currentPath={`/t/${slug}/webhooks`}
      primaryAction={{ label: "Add Endpoint", onClick: () => setIsCreateOpen(true) }}
    >
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
        ) : !webhooks?.length ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-[var(--color-surface-1)] py-16 text-center backdrop-blur-sm">
            <Webhook className="h-10 w-10 text-[var(--color-text-tertiary)]" />
            <p className="text-[var(--color-text-secondary)]">No webhook endpoints yet.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]">
              <Plus className="mr-2 h-4 w-4" /> Add Endpoint
            </Button>
          </div>
        ) : (
          webhooks.map((wh) => (
            <div key={wh.id} className="rounded-2xl bg-[var(--color-surface-1)] backdrop-blur-sm border border-white/20">
              <div className="flex items-center gap-4 px-6 py-4">
                <Webhook className="h-5 w-5 shrink-0 text-[var(--color-accent)]" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm text-[var(--color-text-primary)] truncate">{wh.url}</p>
                  {wh.description && (
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{wh.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <Badge key={ev} variant="outline" className="font-mono text-xs">{ev}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={wh.active ? "default" : "secondary"} className={wh.active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""}>
                    {wh.active ? "Active" : "Inactive"}
                  </Badge>
                  {wh.failedCount > 0 && (
                    <Badge variant="destructive" className="text-xs">{wh.failedCount} failed</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)}
                    className="text-[var(--color-text-tertiary)]"
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform ${expandedId === wh.id ? "rotate-90" : ""}`} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => testWebhook.mutate(wh.id)}>
                        <Send className="mr-2 h-4 w-4" /> Send Test
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRotate(wh.id)}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Rotate Secret
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteWebhook.mutate(wh.id)}
                        className="text-[var(--color-danger)]"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {expandedId === wh.id && (
                <div className="border-t border-white/10 px-6 pb-4">
                  <p className="mt-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">Recent Deliveries</p>
                  <DeliveryPanel endpoint={wh} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Webhook Endpoint</DialogTitle>
            <DialogDescription>Events will be signed with HMAC-SHA256 and sent via POST.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                placeholder="https://example.com/webhooks"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input
                placeholder="My webhook"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_EVENTS.map((ev) => (
                  <div key={ev} className="flex items-center gap-2">
                    <Checkbox
                      id={`ev-${ev}`}
                      checked={selectedEvents.includes(ev)}
                      onCheckedChange={() => toggleEvent(ev)}
                    />
                    <label htmlFor={`ev-${ev}`} className="font-mono text-xs cursor-pointer">{ev}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!url || selectedEvents.length === 0 || createWebhook.isPending}
              className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]"
            >
              {createWebhook.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotated Secret Dialog */}
      <Dialog open={!!rotatedSecret} onOpenChange={() => setRotatedSecret(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Signing Secret</DialogTitle>
            <DialogDescription>Copy this now — it won't be shown again.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-[var(--color-surface-2)] px-4 py-3 font-mono text-xs break-all text-[var(--color-text-primary)]">
            {rotatedSecret?.secret}
          </div>
          <DialogFooter>
            <Button onClick={() => setRotatedSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
