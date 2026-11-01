'use client';
import { type ReactNode } from 'react';
import Link from 'next/link';
import {
  Inbox,
  FileSpreadsheet,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Plus,
  RefreshCw,
  Sparkles,
  SearchX,
  CreditCard,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'gold' | 'burgundy' | 'success' | 'neutral';
  action?: ReactNode;
  className?: string;
}

export function BrandedEmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  tone = 'gold',
  action,
  className,
}: EmptyStateProps) {
  const toneMap = {
    gold: {
      bg: 'bg-gold-soft border-[#C6A46A]/30 text-[#8A6B2E]',
      ring: 'border-[#C6A46A]/20',
    },
    burgundy: {
      bg: 'bg-[#F1E6EA] border-burgundy/20 text-burgundy',
      ring: 'border-burgundy/10',
    },
    success: {
      bg: 'bg-success-soft border-success/30 text-success',
      ring: 'border-success/20',
    },
    neutral: {
      bg: 'bg-surface-2 border-line text-ink-soft',
      ring: 'border-line',
    },
  };

  const currentTone = toneMap[tone];

  return (
    <div
      className={cn(
        'relative overflow-hidden flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-line bg-gradient-to-b from-white to-[#F7F5F1]/80 shadow-card',
        className
      )}
    >
      {/* Decorative hairline gold emblem backdrop */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#C6A46A_1px,transparent_1px)] [background-size:16px_16px]" />

      <div
        className={cn(
          'relative h-14 w-14 rounded-2xl border flex items-center justify-center mb-4 shadow-sm transition-transform duration-300 hover:scale-105',
          currentTone.bg
        )}
      >
        <Icon className="h-6 w-6" />
        <span className={cn('absolute -inset-1 rounded-2xl border pointer-events-none', currentTone.ring)} />
      </div>

      <h3 className="font-serif text-xl text-burgundy-deep font-normal tracking-tight">{title}</h3>
      {hint && <p className="text-sm text-ink-soft mt-1.5 max-w-md leading-relaxed">{hint}</p>}

      {action && <div className="mt-6 flex items-center gap-3">{action}</div>}
    </div>
  );
}

/** Pre-configured branded empty states */

export function NoEnquiriesEmptyState({ onClear, onNew }: { onClear?: () => void; onNew?: () => void }) {
  return (
    <BrandedEmptyState
      icon={SearchX}
      tone="gold"
      title="No enquiries match your active filters"
      hint="Refine your search parameters or log a new couple enquiry for Jaipur or Udaipur."
      action={
        <div className="flex items-center gap-2">
          {onClear && (
            <button className="btn-secondary btn-sm" onClick={onClear}>
              <RefreshCw className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
          {onNew ? (
            <button className="btn-primary btn-sm" onClick={onNew}>
              <Plus className="h-3.5 w-3.5" />
              Log new enquiry
            </button>
          ) : (
            <Link href="/enquiries?new=1" className="btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" />
              Log new enquiry
            </Link>
          )}
        </div>
      }
    />
  );
}

export function NoQuotationsEmptyState({ onRequest }: { onRequest?: () => void }) {
  return (
    <BrandedEmptyState
      icon={FileSpreadsheet}
      tone="gold"
      title="Compare 3+ vendor quotations side-by-side"
      hint="Invite empanelled catering, decor, and photography vendors to submit structured line-item bids."
      action={
        onRequest ? (
          <button className="btn-primary btn-sm" onClick={onRequest}>
            <Plus className="h-3.5 w-3.5" />
            Request vendor quotations
          </button>
        ) : (
          <Link href="/procurement?tab=rfqs&new=1" className="btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" />
            Request vendor quotations
          </Link>
        )
      }
    />
  );
}

export function TasksNotGeneratedEmptyState({ weddingId }: { weddingId?: string }) {
  return (
    <BrandedEmptyState
      icon={Sparkles}
      tone="burgundy"
      title="25+ automated planning tasks unlock once deposit is recorded"
      hint="Standard operating checklists, run sheets, and vendor milestones are automatically generated upon booking deposit verification."
      action={
        <div className="flex items-center gap-2">
          <Link href={weddingId ? `/payments?weddingId=${weddingId}&new=1` : '/payments?new=1'} className="btn-primary btn-sm">
            <CreditCard className="h-3.5 w-3.5" />
            Record booking deposit
          </Link>
          <Link href={weddingId ? `/tasks?weddingId=${weddingId}&generate=1` : '/tasks'} className="btn-secondary btn-sm">
            Generate checklist now
          </Link>
        </div>
      }
    />
  );
}

export function ZeroIncidentsBadge() {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-success/30 bg-success-soft text-success shadow-sm">
      <div className="h-8 w-8 rounded-lg bg-white/80 grid place-items-center shadow-xs">
        <ShieldCheck className="h-5 w-5 text-success" />
      </div>
      <div className="text-left flex-1">
        <p className="text-sm font-medium text-[#186241]">All events running smoothly — Zero open incidents</p>
        <p className="text-xs text-[#21845A]/80">Ground staff on venue alert. Everything is on schedule.</p>
      </div>
      <Link href="/incidents?new=1" className="btn-secondary btn-sm bg-white hover:bg-surface-2 border-line text-ink">
        <Plus className="h-3.5 w-3.5" />
        Log incident
      </Link>
    </div>
  );
}

export function NoDocumentsEmptyState({ onUpload }: { onUpload?: () => void }) {
  return (
    <BrandedEmptyState
      icon={FileText}
      tone="neutral"
      title="No documents in vault"
      hint="Upload signed client agreements, venue floor plans, GST invoices, or high-res layout sketches to private MinIO storage."
      action={
        onUpload ? (
          <button className="btn-primary btn-sm" onClick={onUpload}>
            <Upload className="h-3.5 w-3.5" />
            Upload document
          </button>
        ) : (
          <Link href="/documents?upload=1" className="btn-primary btn-sm">
            <Upload className="h-3.5 w-3.5" />
            Upload document
          </Link>
        )
      }
    />
  );
}

