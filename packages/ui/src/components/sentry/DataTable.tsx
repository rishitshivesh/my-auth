'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { SentrySkeleton } from './SentrySkeleton';



interface Column<T> {
  header: string;
  accessorKey: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  /** Text for the empty row; callers supply localised copy. */
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  isLoading,
  onRowClick,
  emptyMessage = 'No results found.',
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <SentrySkeleton className="h-10 w-full" />
        <SentrySkeleton className="h-20 w-full" />
        <SentrySkeleton className="h-20 w-full" />
        <SentrySkeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border border-border bg-card overflow-hidden', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border bg-black/5">
            {columns.map((column, index) => (
              <TableHead
                key={index}
                className={cn(
                  'text-[10px] font-display font-bold uppercase tracking-[0.08em] text-muted-foreground h-10',
                  column.className
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-sm font-body text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  'hover:bg-black/5 transition-colors border-b border-border last:border-0',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column, colIndex) => (
                  <TableCell key={colIndex} className={cn('py-4 font-body text-sm', column.className)}>
                    {typeof column.accessorKey === 'function'
                      ? column.accessorKey(row)
                      : (row[column.accessorKey] as React.ReactNode)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
