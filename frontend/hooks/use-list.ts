'use client';
import { useState } from 'react';
import { useApi, asRows } from './use-api';

/** Paginated + searchable list backed by a REST collection. */
export function useList<T>(path: string, extra: Record<string, string | number | boolean | undefined | null> = {}, pageSize = 15) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(null);
  const q = { ...extra, page, pageSize, search: search || undefined, sort: sort?.id, order: sort ? (sort.desc ? 'desc' : 'asc') : undefined };
  const r = useApi<unknown>(path, q);
  const rows = asRows<T>(r.data);
  return {
    rows, total: r.meta?.total ?? rows.length, page, pageSize, loading: r.loading, error: r.error, reload: r.reload,
    setPage, search, setSearch: (s: string) => { setSearch(s); setPage(1); }, setSort: (id: string, desc: boolean) => setSort({ id, desc }),
  };
}
