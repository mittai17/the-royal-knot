'use client';
import type { ReactNode } from 'react';
import { Card, ErrorState, Skeleton } from '@/components/ui/primitives';

/** Loading / error wrapper used by the ops screens. */
export function Async({ loading, error, onRetry, hasData, children, rows = 3 }: { loading: boolean; error: string | null; onRetry?: () => void; hasData: boolean; children: ReactNode; rows?: number }) {
  if (error && !hasData) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>;
  if (loading && !hasData) return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  return <>{children}</>;
}

export const tzOffset = () => -new Date().getTimezoneOffset();
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const toIso = (date: string, time: string) => new Date(`${date}T${time || '00:00'}`).toISOString();
export const hhmm = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const ymd = (iso?: string | null) => (iso ? localDate(new Date(iso)) : '');
