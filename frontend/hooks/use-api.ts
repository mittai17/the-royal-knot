'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiMeta } from '@/lib/api';

type Query = Record<string, string | number | boolean | undefined | null>;
interface State<T> { data: T | null; meta?: ApiMeta; loading: boolean; error: string | null }

/** Minimal fetch hook: refetches when path/query change, exposes reload(). */
export function useApi<T>(path: string | null, query?: Query) {
  const [s, setS] = useState<State<T>>({ data: null, loading: !!path, error: null });
  const key = path ? path + JSON.stringify(query ?? {}) : '';
  const seq = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!path) return;
    const id = ++seq.current;
    if (!silent) setS((p) => ({ ...p, loading: true, error: null }));
    try {
      const r = await api.get<T>(path, query);
      if (id === seq.current) setS({ data: r.data, meta: r.meta, loading: false, error: null });
    } catch (e) {
      if (id === seq.current) setS((p) => ({ ...p, loading: false, error: e instanceof Error ? e.message : 'Request failed' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { void load(); }, [load]);
  return { ...s, reload: () => load(true), setData: (d: T) => setS((p) => ({ ...p, data: d })) };
}

/** Normalises list payloads: backend may return an array or {rows|items}. */
export function asRows<T>(d: unknown): T[] {
  if (Array.isArray(d)) return d as T[];
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>;
    for (const k of ['rows', 'items', 'results']) if (Array.isArray(o[k])) return o[k] as T[];
  }
  return [];
}
