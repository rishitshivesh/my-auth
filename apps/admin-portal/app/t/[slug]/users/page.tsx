'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import {
  PageHeader,
  SentryButton,
  SentryInput,
  DataTable,
  StatusBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@repo/ui';
import { Textarea } from '@repo/ui/components/ui/textarea';
import {
  useTenantUsers,
  useInviteUser,
  useSuspendUser,
  useRestoreUser,
  useDeleteTenantUser,
  useSendEmailToUser,
} from '@/lib/queries';
import type { UserListItem } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Search, MoreHorizontal, Eye, Ban, Trash2, Mail, Download, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';

export default function UsersListPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'active' | 'suspended'>('all');

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [suspendTarget, setSuspendTarget] = React.useState<UserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<UserListItem | null>(null);
  const [emailTarget, setEmailTarget] = React.useState<UserListItem | null>(null);
  const [suspendReason, setSuspendReason] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [deleteConfirm, setDeleteConfirm] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailBody, setEmailBody] = React.useState('');

  const inviteUser = useInviteUser();
  const suspendUser = useSuspendUser();
  const restoreUser = useRestoreUser();
  const deleteUser = useDeleteTenantUser();
  const sendEmail = useSendEmailToUser();

  const { data, isLoading } = useTenantUsers({ search: search || undefined, status });

  const columns = [
    {
      header: 'User',
      accessorKey: (row: UserListItem) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-display font-bold text-accent">
            {(row.displayName ?? row.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="font-display font-semibold text-foreground leading-none mb-0.5">
              {row.displayName ?? 'Unnamed User'}
            </span>
            <span className="text-[11px] font-body text-muted-foreground leading-none">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessorKey: (row: UserListItem) => <StatusBadge status={row.isActive ? 'active' : 'suspended'} />,
    },
    {
      header: 'Email Verified',
      accessorKey: (row: UserListItem) => (
        <StatusBadge status={row.emailVerified ? 'active' : 'pending'} className="px-1 py-0">
          {row.emailVerified ? 'Verified' : 'Unverified'}
        </StatusBadge>
      ),
    },
    {
      header: 'Last Active',
      accessorKey: (row: UserListItem) => (
        <span className="text-xs font-body text-muted-foreground">
          {row.lastLoginAt
            ? formatDistanceToNow(new Date(row.lastLoginAt), { addSuffix: true })
            : 'Never'}
        </span>
      ),
    },
    {
      header: '',
      className: 'w-[50px]',
      accessorKey: (row: UserListItem) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <SentryButton variant="icon" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </SentryButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px] bg-popover/95 backdrop-blur-md border-border shadow-xl">
            <DropdownMenuItem onClick={() => router.push(`/t/${slug}/users/${row.id}`)}>
              <Eye className="mr-2 h-3.5 w-3.5" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEmailTarget(row)}>
              <Mail className="mr-2 h-3.5 w-3.5" />
              Send Email
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {row.isActive ? (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setSuspendTarget(row)}>
                <Ban className="mr-2 h-3.5 w-3.5" />
                Suspend
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => restoreUser.mutate(row.id)}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Restore
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(row)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <PortalLayout>
      <div className="space-y-8">
        <PageHeader
          title="Users"
          subtitle={`Manage access for ${data?.pagination.total ?? 0} identities in this workspace`}
          action={
            <SentryButton variant="accent" className="gap-2" onClick={() => setInviteOpen(true)}>
              <Plus className="w-4 h-4" />
              Invite User
            </SentryButton>
          }
        />

        <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <SentryInput
              placeholder="Search by name, email, or ID..."
              className="pl-9 bg-black/5 border-transparent focus:bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto ml-auto">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'all' | 'active' | 'suspended')}
              className="h-[42px] px-4 rounded-sm border border-transparent bg-black/5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended</option>
            </select>
            <SentryButton
              variant="ghost"
              className="h-[42px] gap-2"
              onClick={() => {
                const url = `${authClient.getBaseURL()}/api/admin/users/export?search=${search}&status=${status}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </SentryButton>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={data?.users ?? []}
          isLoading={isLoading}
          onRowClick={(row) => router.push(`/t/${slug}/users/${row.id}`)}
        />

        {!isLoading && (data?.users.length ?? 0) === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm font-body text-muted-foreground">No users found matching your filters.</p>
          </div>
        )}
      </div>

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) { setInviteOpen(false); setInviteEmail(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Send an invitation email to add someone to this workspace.</DialogDescription>
          </DialogHeader>
          <SentryInput
            type="email"
            placeholder="user@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <DialogFooter>
            <SentryButton variant="ghost" onClick={() => { setInviteOpen(false); setInviteEmail(''); }}>Cancel</SentryButton>
            <SentryButton
              variant="accent"
              disabled={!inviteEmail || inviteUser.isPending}
              onClick={() => inviteUser.mutate({ email: inviteEmail }, { onSuccess: () => { setInviteOpen(false); setInviteEmail(''); } })}
            >
              {inviteUser.isPending ? 'Sending…' : 'Send Invite'}
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend User Dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={(o) => { if (!o) { setSuspendTarget(null); setSuspendReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.displayName ?? suspendTarget?.email}?</DialogTitle>
            <DialogDescription>The user will lose access immediately. You can restore them later.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for suspension (required)"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <SentryButton variant="ghost" onClick={() => { setSuspendTarget(null); setSuspendReason(''); }}>Cancel</SentryButton>
            <SentryButton
              variant="destructive"
              disabled={!suspendReason.trim() || suspendUser.isPending}
              onClick={() => suspendUser.mutate(
                { userId: suspendTarget!.id, reason: suspendReason },
                { onSuccess: () => { setSuspendTarget(null); setSuspendReason(''); } }
              )}
            >
              {suspendUser.isPending ? 'Suspending…' : 'Suspend User'}
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirm(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.displayName ?? deleteTarget?.email}?</DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone. Type{' '}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{deleteTarget?.email}</code> to confirm.
            </DialogDescription>
          </DialogHeader>
          <SentryInput
            placeholder={deleteTarget?.email}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="font-mono"
          />
          <DialogFooter>
            <SentryButton variant="ghost" onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}>Cancel</SentryButton>
            <SentryButton
              variant="destructive"
              disabled={deleteConfirm !== deleteTarget?.email || deleteUser.isPending}
              onClick={() => deleteUser.mutate(deleteTarget!.id, { onSuccess: () => { setDeleteTarget(null); setDeleteConfirm(''); } })}
            >
              {deleteUser.isPending ? 'Deleting…' : 'Delete Permanently'}
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={!!emailTarget} onOpenChange={(o) => { if (!o) { setEmailTarget(null); setEmailSubject(''); setEmailBody(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {emailTarget?.displayName ?? emailTarget?.email}</DialogTitle>
            <DialogDescription>Send a direct email to this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <SentryInput
              placeholder="Subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <Textarea
              placeholder="Message body"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <SentryButton variant="ghost" onClick={() => { setEmailTarget(null); setEmailSubject(''); setEmailBody(''); }}>Cancel</SentryButton>
            <SentryButton
              variant="accent"
              disabled={!emailSubject.trim() || !emailBody.trim() || sendEmail.isPending}
              onClick={() => sendEmail.mutate(
                { userId: emailTarget!.id, subject: emailSubject, body: emailBody },
                { onSuccess: () => { setEmailTarget(null); setEmailSubject(''); setEmailBody(''); } }
              )}
            >
              {sendEmail.isPending ? 'Sending…' : 'Send Email'}
            </SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
