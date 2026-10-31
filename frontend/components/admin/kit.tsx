'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { ErrorState, Modal, Skeleton } from '@/components/ui/primitives';
import { notify } from '@/lib/toast';

export const fmtBytes = (n?: number | null) => {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${u[i]}`;
};
export const fmtDuration = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`; };

/** Skeleton while loading, retryable error otherwise, children once data exists. */
export function Load({ state, children, rows = 4 }: { state: { data: unknown; loading: boolean; error: string | null; reload: () => void }; children: ReactNode; rows?: number }) {
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.loading && !state.data) return <div className="space-y-3 p-2">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>;
  return <>{children}</>;
}

/** Runs an async action with busy flag + toast errors. */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { const r = await fn(); if (ok) notify.ok(ok); return r; } catch (e) { notify.err(e); return undefined; } finally { setBusy(null); }
  };
  return { busy, run };
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 disabled:opacity-50 ${checked ? 'bg-burgundy' : 'bg-line'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export function Confirm({ open, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}</button></>}>
      <div className="text-sm">{message}</div>
    </Modal>
  );
}

/** Calls fn every `ms` while mounted and enabled. */
export function useInterval(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { if (!enabled) return; const t = setInterval(() => ref.current(), ms); return () => clearInterval(t); }, [ms, enabled]);
}

export function Meter({ pct, label }: { pct: number; label?: string }) {
  const tone = pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-success';
  return <div title={label}><div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div></div>;
}

export function RevealOnce({ title, value, onClose }: { title: string; value: string | null; onClose: () => void }) {
  return (
    <Modal open={!!value} onClose={onClose} title={title} footer={<><button className="btn-secondary" onClick={() => value && navigator.clipboard?.writeText(value).then(() => notify.ok('Copied'))}>Copy</button><button className="btn-primary" onClick={onClose}>Done</button></>}>
      <p className="text-sm text-ink-soft mb-3">Share this one-time password securely. It is not stored in readable form and will not be shown again. The user must change it at next sign-in.</p>
      <code className="block rounded-lg bg-surface-2 px-4 py-3 text-lg tracking-wide select-all">{value}</code>
    </Modal>
  );
}
