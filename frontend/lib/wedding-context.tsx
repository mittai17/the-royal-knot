'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { asRows } from '@/hooks/use-api';
import type { Wedding } from '@/types';

interface Ctx { weddings: Wedding[]; selectedId: string | null; selected: Wedding | null; select: (id: string | null) => void; loading: boolean }
const C = createContext<Ctx>({ weddings: [], selectedId: null, selected: null, select: () => {}, loading: true });

/** Global wedding selector state; scopes Tasks, Guests, Payments, Command Centre etc. */
export function WeddingProvider({ children }: { children: ReactNode }) {
  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;

  useEffect(() => {
    if (authLoading) return;
    // The system administrator has no access to wedding data; skip the (403) lookup.
    if (!role || role === 'SYSADMIN') { setLoading(false); return; }
    api.get<unknown>('/weddings', { pageSize: 100 })
      .then((r) => {
        const rows = asRows<Wedding>(r.data);
        setWeddings(rows);
        let saved: string | null = null;
        try { saved = localStorage.getItem('rk.wedding'); } catch { /* storage unavailable */ }
        const live = rows.find((w) => w.status === 'EVENT_DAY') ?? rows.find((w) => w.status !== 'COMPLETED' && w.status !== 'CANCELLED');
        setSelectedId(rows.find((w) => w.id === saved)?.id ?? live?.id ?? rows[0]?.id ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [authLoading, role]);

  const select = (id: string | null) => {
    setSelectedId(id);
    try { if (id) localStorage.setItem('rk.wedding', id); } catch { /* ignore */ }
  };
  return <C.Provider value={{ weddings, selectedId, selected: weddings.find((w) => w.id === selectedId) ?? null, select, loading }}>{children}</C.Provider>;
}
export const useWedding = () => useContext(C);
