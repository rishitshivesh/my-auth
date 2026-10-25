'use client';

import * as React from 'react';
import { MoreHorizontal, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DataTable } from '../sentry/DataTable';
import { SentryButton } from '../sentry/SentryButton';
import { SentryInput } from '../sentry/SentryInput';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { StateView, type StateViewAction } from './StateView';

export interface ResourceColumn<T> {
  header: string;
  accessorKey: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

export interface RowAction {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export type ResourceStatus = 'loading' | 'ready' | 'error' | 'denied' | 'unavailable';

export interface ResourceTableLabels {
  searchLabel: string;
  searchPlaceholder: string;
  previous: string;
  next: string;
  pageStatus: string;
  loading: { title: string };
  empty: { title: string; description?: string; action?: StateViewAction };
  filteredEmpty: { title: string; description?: string; clear?: StateViewAction };
  error: { title: string; description?: string; retry?: StateViewAction };
  denied: { title: string; description?: string };
  unavailable: { title: string; description?: string; retry?: StateViewAction };
}

export interface ResourceTableProps<T extends { id: string | number }> {
  columns: ResourceColumn<T>[];
  rows: T[];
  status: ResourceStatus;
  labels: Omit<ResourceTableLabels, 'rowActions'> & { rowActions: (row: T) => string };
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Filter controls rendered beside the search box. */
  filters?: React.ReactNode;
  /** True when search or filters are active; selects the filtered-empty state. */
  isFiltered?: boolean;
  pagination?: { page: number; hasPrevious: boolean; hasNext: boolean; onPrevious: () => void; onNext: () => void };
  rowActions?: (row: T) => readonly RowAction[];
  onRowClick?: (row: T) => void;
  /** Request in flight for a refetch while rows are shown. */
  isRefreshing?: boolean;
  className?: string;
}

export function ResourceTable<T extends { id: string | number }>({
  columns, rows, status, labels, searchValue, onSearchChange, filters, isFiltered, pagination, rowActions,
  onRowClick, isRefreshing, className,
}: ResourceTableProps<T>) {
  const allColumns: ResourceColumn<T>[] = rowActions
    ? [
        ...columns,
        {
          header: '',
          className: 'w-12 text-right',
          accessorKey: (row: T) => {
            const actions = rowActions(row);
            if (actions.length === 0) return null;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SentryButton
                    variant="icon"
                    size="icon"
                    aria-label={labels.rowActions(row)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                  </SentryButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {actions.map((action) => (
                    <DropdownMenuItem
                      key={action.id}
                      disabled={action.disabled}
                      variant={action.destructive ? 'destructive' : 'default'}
                      onSelect={action.onSelect}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        },
      ]
    : columns;

  const showToolbar = Boolean(onSearchChange || filters);

  return (
    <div className={cn('space-y-4', className)}>
      {showToolbar && (
        <div role="search" className="flex flex-wrap items-end gap-3">
          {onSearchChange && (
            <div className="relative min-w-[200px] flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-muted-foreground" />
              <SentryInput
                type="search"
                label={labels.searchLabel}
                placeholder={labels.searchPlaceholder}
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          {filters}
        </div>
      )}
      {status === 'loading' && <StateView kind="loading" title={labels.loading.title} />}
      {status === 'error' && (
        <StateView kind="error" title={labels.error.title} description={labels.error.description} action={labels.error.retry} />
      )}
      {status === 'unavailable' && (
        <StateView kind="unavailable" title={labels.unavailable.title} description={labels.unavailable.description} action={labels.unavailable.retry} />
      )}
      {status === 'denied' && (
        <StateView kind="denied" title={labels.denied.title} description={labels.denied.description} />
      )}
      {status === 'ready' && rows.length === 0 && (
        isFiltered ? (
          <StateView kind="filtered-empty" title={labels.filteredEmpty.title} description={labels.filteredEmpty.description} action={labels.filteredEmpty.clear} />
        ) : (
          <StateView kind="empty" title={labels.empty.title} description={labels.empty.description} action={labels.empty.action} />
        )
      )}
      {status === 'ready' && rows.length > 0 && (
        <div aria-busy={isRefreshing || undefined} className={cn(isRefreshing && 'opacity-70 transition-opacity')}>
          <DataTable columns={allColumns} data={rows} onRowClick={onRowClick} emptyMessage={labels.empty.title} />
        </div>
      )}
      {status === 'ready' && pagination && (rows.length > 0 || pagination.hasPrevious) && (
        <nav className="flex items-center justify-between gap-3" aria-label={labels.pageStatus}>
          <span className="font-body text-sm text-muted-foreground" aria-live="polite">{labels.pageStatus}</span>
          <div className="flex gap-2">
            <SentryButton variant="outline" size="sm" disabled={!pagination.hasPrevious} onClick={pagination.onPrevious}>
              {labels.previous}
            </SentryButton>
            <SentryButton variant="outline" size="sm" disabled={!pagination.hasNext} onClick={pagination.onNext}>
              {labels.next}
            </SentryButton>
          </div>
        </nav>
      )}
    </div>
  );
}
