'use client';
import { useState, type ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Card, EmptyState, ErrorState, TableSkeleton, Pagination } from '@/components/ui/primitives';
import { useApi, asRows } from '@/hooks/use-api';
import { apiUrl } from '@/lib/api';
import { fmtDate, inr, toNum } from '@/lib/utils';
import type { ApiMeta } from '@/lib/api';

type Q = Record<string, string | number | boolean | undefined | null>;

/** Paginated collection with the backend `meta` (including per-endpoint summaries) exposed. */
export function usePaged<T, M = Record<string, unknown>>(path: string | null, extra: Q = {}, pageSize = 15) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const r = useApi<unknown>(path, { ...extra, page, pageSize, search: search || undefined });
  const rows = asRows<T>(r.data);
  const meta = (r.meta ?? {}) as ApiMeta & M;
  return { rows, meta, total: meta.total ?? rows.length, page, pageSize, setPage, search, setSearch: (s: string) => { setSearch(s); setPage(1); }, loading: r.loading, error: r.error, reload: r.reload };
}

/** Resets to page 1 whenever a filter changes. */
export function useFilterReset(setPage: (n: number) => void) { return () => setPage(1); }

/** A plain table: header labels + rows already rendered by the caller. Matches DataTable styling but without sorting. */
export function SimpleTable({ head, children, empty, loading, error, onRetry, minWidth = 720 }: { head: ReactNode[]; children: ReactNode; empty?: boolean; loading?: boolean; error?: string | null; onRetry?: () => void; minWidth?: number }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading) return <TableSkeleton cols={Math.min(head.length, 6)} />;
  if (empty) return <EmptyState title="Nothing here yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse dt" style={{ minWidth }}>
        <thead><tr>{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableCard({ title, action, children, footer }: { title?: ReactNode; action?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return <Card pad={false} title={title} action={action}><div className="pt-1">{children}</div>{footer}</Card>;
}

export function Pager({ p }: { p: { page: number; pageSize: number; total: number; setPage: (n: number) => void } }) {
  return p.total > p.pageSize ? <Pagination page={p.page} pageSize={p.pageSize} total={p.total} onPage={p.setPage} /> : null;
}

export function DownloadLink({ href, label = 'Export CSV', className = 'btn-secondary btn-sm' }: { href: string; label?: string; className?: string }) {
  return <a className={className} href={apiUrl(href)} download><Download className="h-3.5 w-3.5" />{label}</a>;
}
export function PdfLink({ href, label = 'PDF' }: { href: string; label?: string }) {
  return <a className="btn-secondary btn-sm" href={apiUrl(href)} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" />{label}</a>;
}

export function BusyButton({ busy, className = 'btn-primary', children, ...rest }: { busy?: boolean; className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={className} {...rest} disabled={busy || rest.disabled}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>;
}

export const Money = ({ v, negative }: { v: unknown; negative?: boolean }) => <span className={`tabular-nums ${negative ?? toNum(v) < 0 ? 'text-danger' : ''}`}>{inr(v)}</span>;
export const D = ({ v }: { v?: string | null }) => <span className="whitespace-nowrap">{fmtDate(v)}</span>;
export const Muted = ({ children }: { children: ReactNode }) => <span className="block text-xs text-ink-soft">{children}</span>;
