'use client';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

interface Props<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  onRowClick?: (row: T) => void;
  /** Server-side sorting: when provided, header clicks call this instead of sorting locally. */
  onSort?: (id: string, desc: boolean) => void;
}

export function DataTable<T>({ columns, data, loading, error, onRetry, emptyTitle = 'Nothing here yet', emptyHint, onRowClick, onSort }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data, columns, state: { sorting }, getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: onSort ? undefined : getSortedRowModel(),
    manualSorting: !!onSort,
    onSortingChange: (u) => {
      const next = typeof u === 'function' ? u(sorting) : u;
      setSorting(next);
      if (onSort && next[0]) onSort(next[0].id, next[0].desc);
    },
  });

  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading) return <TableSkeleton cols={Math.min(columns.length, 6)} />;
  if (!data.length) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse dt">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sortable = h.column.getCanSort();
                const dir = h.column.getIsSorted();
                return (
                  <th key={h.id} className="th" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}>
                    {h.isPlaceholder ? null : sortable ? (
                      <button className="inline-flex items-center gap-1 uppercase tracking-wider" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-surface-2/50')} onClick={() => onRowClick?.(r.original)}>
              {r.getVisibleCells().map((c) => <td key={c.id} className="td">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
