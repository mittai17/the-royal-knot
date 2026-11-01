'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, Loader2, ShieldAlert, AlertTriangle } from 'lucide-react';
import { Card, EmptyState, ErrorState, TableSkeleton, Pagination } from '@/components/ui/primitives';
import { useApi, asRows } from '@/hooks/use-api';
import { ApiError, apiUrl } from '@/lib/api';
import { notify } from '@/lib/toast';
import { Segmented } from '@/components/shared/form-bits';
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


/** Tab state kept in `?tab=` (or another param). Unknown values fall back to the default. Switching keeps the other query params except `page`-like state owned by panels. */
export function useTabParam<T extends string>(allowed: readonly T[], fallback: T, param = 'tab'): [T, (t: T) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const raw = sp.get(param) as T | null;
  const tab = raw && allowed.includes(raw) ? raw : fallback;
  const set = useCallback((t: T) => {
    const q = new URLSearchParams(sp.toString());
    if (t === fallback) q.delete(param); else q.set(param, t);
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  }, [sp, router, path, fallback, param]);
  return [tab, set];
}

/** Reads a single query param (e.g. ?weddingId=, ?billId=) without owning navigation. */
export function useQueryParam(name: string): string | null { return useSearchParams().get(name); }

export function TabBar<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: readonly { v: T; l: string }[] }) {
  return <div className="mb-5 max-w-full overflow-x-auto"><Segmented value={value} onChange={onChange} options={tabs} /></div>;
}

/** Maker-checker rules come back as 403/409 with a message starting "Maker-checker:". */
export const isMakerChecker = (e: unknown) => e instanceof Error && /^maker-checker/i.test(e.message);
export function friendlyError(e: unknown): string {
  if (!(e instanceof Error)) return 'Something went wrong';
  if (isMakerChecker(e)) return e.message.replace(/^maker-checker:\s*/i, '').replace(/^./, (c) => c.toUpperCase());
  if (e instanceof ApiError && e.status === 403) return `Not allowed: ${e.message}`;
  return e.message;
}

/** Inline banner for a failed action. Maker-checker rejections get their own wording so people understand it is a control, not a bug. */
export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  const mc = isMakerChecker(error);
  return (
    <div role="alert" className={`flex gap-2.5 rounded-xl px-3.5 py-3 text-sm ${mc ? 'bg-warning-soft text-[#8A5A12]' : 'bg-danger-soft text-danger'}`}>
      {mc ? <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
      <div><p className="font-medium">{mc ? 'Maker-checker control' : 'Could not complete that'}</p><p>{friendlyError(error)}</p></div>
    </div>
  );
}

/**
 * Runs one API action at a time: tracks which action is busy, keeps the last error for an inline banner and fires the success toast only after the API call resolved.
 * `run` resolves to the API result (or undefined on failure) so callers can branch on the payload.
 */
export function useRunner() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>, ok?: string | ((r: T) => string | null)): Promise<T | undefined> => {
    setBusy(label); setError(null);
    try {
      const r = await fn();
      const msg = typeof ok === 'function' ? ok(r) : ok;
      if (msg) notify.ok(msg);
      return r;
    } catch (e) { setError(e); if (!isMakerChecker(e)) notify.err(e); return undefined; } finally { setBusy(''); }
  }, []);
  return { busy, error, setError, run };
}

/** Client-side CSV download for views that merge several API calls. */
export function downloadCsv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const body = [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Wedding picker used by tab views that need one wedding (milestone plan, extra charges, statements). */
export const NO_WEDDING = 'Select a wedding to see this view.';
