'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import { PageHeader, SentryButton, SentryInput, DataTable, StatusBadge } from "@repo/ui";
import { useTenantUsers } from '@/lib/queries';
import type { UserListItem } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Search, MoreHorizontal, Eye, Ban, Trash2, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';

export default function UsersListPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'active' | 'suspended'>('all');

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
            <DropdownMenuItem>
              <Mail className="mr-2 h-3.5 w-3.5" />
              <span>Send Email</span>
            </DropdownMenuItem>
            <div className="h-px bg-border my-1" />
            <DropdownMenuItem className="text-destructive">
              <Ban className="mr-2 h-3.5 w-3.5" />
              <span>Suspend</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              <span>Delete</span>
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
          subtitle={`Manage access for ${data?.pagination.total || 0} identities in this workspace`}
          action={
            <SentryButton variant="accent" className="gap-2">
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
            <SentryButton variant="ghost" className="h-[42px] gap-2">
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
  );
}
