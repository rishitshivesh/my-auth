'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { PageHeader, SentryButton, SentryInput, DataTable, StatusBadge } from "@repo/ui";
import { useTenantUsers } from '@/lib/queries';
import type { UserListItem } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Search, MoreHorizontal, Eye, Ban, Trash2, Mail, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import {
  useInviteUser,
  useSuspendUser,
  useRestoreUser,
  useDeleteTenantUser,
  useSendEmailToUser,
} from '@/lib/queries';

export default function UsersListPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'active' | 'suspended'>('all');

  // Modal state
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

  const { data, isLoading } = useTenantUsers({
    search: search || undefined,
    status,
  });

  const columns = [
    {
      header: 'User',
      accessorKey: (row: UserListItem) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-display font-bold text-accent">
            {row.displayName?.slice(0, 2).toUpperCase() || row.email.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="font-display font-semibold text-foreground leading-none mb-0.5">
              {row.displayName || 'Unnamed User'}
            </span>
            <span className="text-[11px] font-body text-muted-foreground leading-none">
              {row.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessorKey: (row: UserListItem) => (
        <StatusBadge status={row.isActive ? 'active' : 'suspended'} />
      ),
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
          {row.lastLoginAt ? formatDistanceToNow(new Date(row.lastLoginAt), { addSuffix: true }) : 'Never'}
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
              <span>View Details</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEmailTarget(row)}>
              <Mail className="mr-2 h-3.5 w-3.5" />
              <span>Send Email</span>
            </DropdownMenuItem>
            <div className="h-px bg-border my-1" />
            {row.isActive ? (
              <DropdownMenuItem className="text-destructive" onClick={() => setSuspendTarget(row)}>
                <Ban className="mr-2 h-3.5 w-3.5" />
                <span>Suspend</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => restoreUser.mutate(row.id)}>
                <Ban className="mr-2 h-3.5 w-3.5" />
                <span>Restore</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(row)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
    <PortalLayout>
      <div className="space-y-8">
        <PageHeader
          title="Users"
          subtitle={`Manage access for ${data?.pagination.total || 0} identities in this workspace`}
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
          data={data?.users || []}
          isLoading={isLoading}
          onRowClick={(row) => router.push(`/t/${slug}/users/${row.id}`)}
        />

        {!isLoading && data?.users.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm font-body text-muted-foreground">
              No users found matching your filters.
            </p>
          </div>
        )}
      </div>
    </PortalLayout>

    {/* Invite Modal */}
    {inviteOpen && (
      <SimpleModal title="Invite User" onClose={() => { setInviteOpen(false); setInviteEmail(''); }}>
        <input
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          placeholder="user@example.com"
          type="email"
          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid rgba(0,0,0,0.15)', marginBottom: '16px', boxSizing: 'border-box' as const }}
        />
        <SentryButton
          variant="accent"
          disabled={!inviteEmail || inviteUser.isPending}
          onClick={() => inviteUser.mutate({ email: inviteEmail }, { onSuccess: () => { setInviteOpen(false); setInviteEmail(''); } })}
        >
          {inviteUser.isPending ? 'Sending…' : 'Send Invite'}
        </SentryButton>
      </SimpleModal>
    )}

    {/* Suspend Modal */}
    {suspendTarget && (
      <SimpleModal title={`Suspend ${suspendTarget.displayName || suspendTarget.email}?`} onClose={() => { setSuspendTarget(null); setSuspendReason(''); }} danger>
        <textarea
          value={suspendReason}
          onChange={e => setSuspendReason(e.target.value)}
          placeholder="Reason for suspension (required)"
          rows={3}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid rgba(0,0,0,0.15)', marginBottom: '16px', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: 'DM Sans, sans-serif' }}
        />
        <SentryButton
          variant="destructive"
          disabled={!suspendReason.trim() || suspendUser.isPending}
          onClick={() => suspendUser.mutate({ userId: suspendTarget.id, reason: suspendReason }, { onSuccess: () => { setSuspendTarget(null); setSuspendReason(''); } })}
        >
          {suspendUser.isPending ? 'Suspending…' : 'Suspend User'}
        </SentryButton>
      </SimpleModal>
    )}

    {/* Delete Modal */}
    {deleteTarget && (
      <SimpleModal title={`Delete ${deleteTarget.displayName || deleteTarget.email}?`} onClose={() => { setDeleteTarget(null); setDeleteConfirm(''); }} danger>
        <p style={{ fontSize: '13px', color: '#605E5A', marginBottom: '8px' }}>
          Type <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px' }}>{deleteTarget.email}</code> to confirm
        </p>
        <input
          value={deleteConfirm}
          onChange={e => setDeleteConfirm(e.target.value)}
          placeholder={deleteTarget.email}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid rgba(0,0,0,0.15)', marginBottom: '16px', boxSizing: 'border-box' as const, fontFamily: 'JetBrains Mono, monospace' }}
        />
        <SentryButton
          variant="destructive"
          disabled={deleteConfirm !== deleteTarget.email || deleteUser.isPending}
          onClick={() => deleteUser.mutate(deleteTarget.id, { onSuccess: () => { setDeleteTarget(null); setDeleteConfirm(''); } })}
        >
          {deleteUser.isPending ? 'Deleting…' : 'Delete Permanently'}
        </SentryButton>
      </SimpleModal>
    )}

    {/* Send Email Modal */}
    {emailTarget && (
      <SimpleModal title={`Email ${emailTarget.displayName || emailTarget.email}`} onClose={() => { setEmailTarget(null); setEmailSubject(''); setEmailBody(''); }}>
        <input
          value={emailSubject}
          onChange={e => setEmailSubject(e.target.value)}
          placeholder="Subject"
          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid rgba(0,0,0,0.15)', marginBottom: '8px', boxSizing: 'border-box' as const }}
        />
        <textarea
          value={emailBody}
          onChange={e => setEmailBody(e.target.value)}
          placeholder="Message body"
          rows={4}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid rgba(0,0,0,0.15)', marginBottom: '16px', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: 'DM Sans, sans-serif' }}
        />
        <SentryButton
          variant="accent"
          disabled={!emailSubject.trim() || !emailBody.trim() || sendEmail.isPending}
          onClick={() => sendEmail.mutate({ userId: emailTarget.id, subject: emailSubject, body: emailBody }, { onSuccess: () => { setEmailTarget(null); setEmailSubject(''); setEmailBody(''); } })}
        >
          {sendEmail.isPending ? 'Sending…' : 'Send Email'}
        </SentryButton>
      </SimpleModal>
    )}
  </>
  );
}

function SimpleModal({ title, onClose, danger, children }: { title: string; onClose: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderRadius: '20px', padding: '28px', maxWidth: '420px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: danger ? '1px solid rgba(192,57,43,0.2)' : '1px solid rgba(0,0,0,0.08)' }}>
        <h3 style={{ margin: '0 0 16px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '16px' }}>{title}</h3>
        {children}
        <button onClick={onClose} style={{ marginTop: '8px', width: '100%', padding: '8px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
      </div>
    </div>
  );
}
