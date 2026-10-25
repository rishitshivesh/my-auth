"use client";

import { ResourceTable, type ResourceColumn, type ResourceStatus } from "@repo/ui";
import { useCopy } from "@/i18n";
import { useTableLabels } from "@/features/access/components/table-labels";
import type { RoleDto } from "@/features/access/model/types";
import { roleLabel } from "@/features/access/model/role-diff";
import { inviteExpiry } from "../model/invites";
import type { PendingInviteDto } from "../model/types";

export interface InvitationsPanelProps {
  invites: readonly PendingInviteDto[];
  roles: readonly RoleDto[];
  status: ResourceStatus;
  canWrite: boolean;
  onRetry: () => void;
  onInvite?: () => void;
  onRevoke: (invite: PendingInviteDto) => void;
  onResend: (invite: PendingInviteDto) => void;
}

/** Pending invitations (N10): expiry, revoke and resend. Existing-account join is not offered: no API. */
export function InvitationsPanel({ invites, roles, status, canWrite, onRetry, onInvite, onRevoke, onResend }: InvitationsPanelProps) {
  const { t } = useCopy();
  const rows = [...invites];
  const labels = useTableLabels<PendingInviteDto>({
    base: "users.invitations.table",
    rowName: (i) => i.email,
    pageStatus: t("common.labels.results", { count: rows.length }),
    onRetry,
    onClear: onRetry,
    onCreate: canWrite ? onInvite : undefined,
  });
  const roleNames = (ids: readonly string[]) => ids.map((id) => roles.find((r) => r.id === id)).map((r, i) => (r ? roleLabel(r) : ids[i] ?? "")).join(", ");
  const columns: ResourceColumn<PendingInviteDto>[] = [
    { header: t("users.invitations.columns.email"), accessorKey: (i) => <span className="block break-all">{i.email}</span> },
    { header: t("users.invitations.columns.roles"), accessorKey: (i) => <span className="block break-words">{roleNames(i.roleIds) || t("users.invitations.noRoles")}</span> },
    {
      header: t("users.invitations.columns.expires"),
      accessorKey: (i) => {
        const e = inviteExpiry(i.expiresAt);
        return t(`users.invitations.expiry.${e.state}`, { days: e.daysLeft });
      },
    },
  ];
  return (
    <ResourceTable<PendingInviteDto>
      columns={columns}
      rows={rows}
      status={status}
      labels={labels}
      rowActions={canWrite ? (i) => [
        { id: "resend", label: t("users.invitations.resend"), onSelect: () => onResend(i) },
        { id: "revoke", label: t("users.invitations.revoke"), onSelect: () => onRevoke(i), destructive: true },
      ] : undefined}
    />
  );
}
