import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/** Indian-style INR formatting: full (₹1,50,00,000). */
export function inr(v: unknown): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(toNum(v));
}

/** Compact INR: ₹1.5 Cr / ₹95 L / ₹72K. */
export function inrCompact(v: unknown): string {
  const n = toNum(v);
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e8 ? 1 : 2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(0)}K`;
  return `${s}₹${a}`;
}

const safeDate = (d?: string | Date | null) => (d ? (typeof d === 'string' ? parseISO(d) : d) : null);
export const fmtDate = (d?: string | Date | null, f = 'dd MMM yyyy') => {
  const x = safeDate(d);
  return x && !isNaN(x.getTime()) ? format(x, f) : '—';
};
export const fmtTime = (d?: string | Date | null) => fmtDate(d, 'hh:mm a');
export const fmtDateTime = (d?: string | Date | null) => fmtDate(d, 'dd MMM, hh:mm a');
export const ago = (d?: string | Date | null) => {
  const x = safeDate(d);
  return x && !isNaN(x.getTime()) ? `${formatDistanceToNowStrict(x)} ago` : '—';
};
export const toInputDate = (d?: string | null) => (d ? d.slice(0, 10) : '');

export const humanize = (s?: string | null) =>
  (s ?? '').toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
