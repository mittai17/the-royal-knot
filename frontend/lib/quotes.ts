import { toNum } from './utils';
import type { QuotationItem } from '@/types';

export interface LineCalc { base: number; tax: number; extra: number; total: number }

/** Mirrors the server maths: base = qty × unit price, tax on base, plus additional charge. Only included lines count. */
export function calcLine(i: Pick<QuotationItem, 'quantity' | 'unitPrice' | 'taxRate' | 'additionalCharge' | 'included'>): LineCalc {
  if (!i.included) return { base: 0, tax: 0, extra: 0, total: 0 };
  const base = toNum(i.quantity) * toNum(i.unitPrice);
  const tax = (base * toNum(i.taxRate)) / 100;
  const extra = toNum(i.additionalCharge);
  return { base, tax, extra, total: base + tax + extra };
}

export function calcTotals(items: QuotationItem[], guests?: number | null) {
  const t = items.map(calcLine).reduce((a, c) => ({ subtotal: a.subtotal + c.base, tax: a.tax + c.tax, extra: a.extra + c.extra }), { subtotal: 0, tax: 0, extra: 0 });
  const grand = t.subtotal + t.tax + t.extra;
  return { ...t, grand, perPlate: guests && guests > 0 ? grand / guests : null };
}
