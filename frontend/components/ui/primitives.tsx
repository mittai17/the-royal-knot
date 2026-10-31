'use client';
import { type ReactNode, useEffect } from 'react';
import { X, Inbox, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, humanize } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) { return <div className={cn('skeleton h-4 w-full', className)} />; }

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="font-serif text-[28px] leading-8 text-burgundy-deep">{title}</h1>
        {subtitle && <p className="text-sm text-ink-soft mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="h-11 w-11 rounded-full bg-surface-2 grid place-items-center mb-3"><Inbox className="h-5 w-5 text-ink-soft" /></div>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-ink-soft mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <div className="h-11 w-11 rounded-full bg-danger-soft grid place-items-center mb-3"><AlertTriangle className="h-5 w-5 text-danger" /></div>
      <p className="font-medium">Something went wrong</p>
      <p className="text-sm text-ink-soft mt-1 max-w-md">{message}</p>
      {onRetry && <button className="btn-secondary btn-sm mt-4" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((__, c) => <Skeleton key={c} className="h-5" />)}
        </div>
      ))}
    </div>
  );
}

const TONES: Record<string, string> = {
  success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-[#A8701A]', danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info', neutral: 'bg-surface-2 text-ink-soft', gold: 'bg-gold-soft text-[#8A6B2E]', burgundy: 'bg-[#F1E6EA] text-burgundy',
};
const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'success', PAID: 'success', ARRIVED: 'success', CONFIRMED: 'success', ACCEPTED: 'success', APPROVED: 'success', RESOLVED: 'success', SIGNED: 'success', SETTLED: 'success', ACTIVE: 'success', CHECKED_IN: 'success', RECEIVED: 'success', CLOSED: 'success',
  IN_PROGRESS: 'info', CONTACTED: 'info', DUE: 'warning', UPCOMING: 'neutral', SCHEDULED: 'neutral', SENT: 'info', OPEN: 'info', PROPOSAL_SENT: 'info', CONSULTATION_SCHEDULED: 'info', UNDER_REVIEW: 'info',
  PARTIALLY_PAID: 'warning', WAITING_FOR_VENDOR: 'warning', NEGOTIATION: 'warning', PENDING: 'warning', DELAYED: 'warning', PLANNING: 'gold', REQUESTED: 'warning', INVESTIGATING: 'warning',
  IN_REVIEW: 'info', VERIFIED: 'info', FULFILLED: 'success', VOID: 'danger', OVERDUE: 'danger', BLOCKED: 'danger', LOST: 'danger', CANCELLED: 'danger', REJECTED: 'danger', NOT_SELECTED: 'neutral', CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral', NEW: 'burgundy', TO_PLAN: 'neutral', NOT_ARRIVED: 'neutral', DECLINED: 'danger',
};
export function StatusBadge({ status, tone }: { status?: string | null; tone?: keyof typeof TONES }) {
  const key = (status ?? '').toUpperCase().replace(/[\s-]+/g, '_');
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone ?? STATUS_TONE[key] ?? 'neutral'])}>{humanize(key) || '—'}</span>;
}

export function StatCard({ label, value, hint, icon, trend }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; trend?: { label: string; positive?: boolean } }) {
  return (
    <div className="card p-4 flex items-start gap-3 min-w-0">
      {icon && <div className="h-10 w-10 rounded-xl bg-gold-soft text-burgundy hidden sm:grid xl:hidden 2xl:grid place-items-center shrink-0">{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs text-ink-soft truncate">{label}</p>
        <p className="num text-[24px] leading-8 mt-0.5 whitespace-nowrap">{value}</p>
        <p className="text-xs text-ink-soft mt-0.5 flex gap-2">
          {trend && <span className={trend.positive === false ? 'text-danger' : 'text-success'}>{trend.label}</span>}
          {hint}
        </p>
      </div>
    </div>
  );
}

export function Card({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('card min-w-0', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-3">
          <h2 className="font-serif text-lg text-burgundy-deep min-w-0">{title}</h2><div className="max-w-full">{action}</div>
        </header>
      )}
      <div className={pad ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg', side = false, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string; side?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-burgundy-deep/40" onClick={onClose} />
      <div className={cn('relative bg-white shadow-pop flex flex-col max-h-full', side ? `ml-auto h-full w-full ${width}` : `m-auto w-[calc(100%-32px)] ${width} rounded-2xl max-h-[90vh]`)}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-serif text-xl text-burgundy-deep">{title}</h2>
          <button className="btn-ghost btn-sm !px-2" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && <footer className="px-6 py-4 border-t border-line flex justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, error, children, className }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs text-ink-soft">
      <span>{total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-sm !px-2" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2">Page {page} / {pages}</span>
        <button className="btn-ghost btn-sm !px-2" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name?: string | null; size?: number }) {
  const ini = (name ?? '?').split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return <span className="inline-grid place-items-center rounded-full bg-burgundy text-gold-soft font-medium shrink-0" style={{ width: size, height: size, fontSize: size * 0.38 }}>{ini}</span>;
}

export function ProgressBar({ value, tone = 'success' }: { value: number; tone?: 'success' | 'warning' | 'danger' | 'burgundy' }) {
  const c = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', burgundy: 'bg-burgundy' }[tone];
  return <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className={cn('h-full rounded-full', c)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}
