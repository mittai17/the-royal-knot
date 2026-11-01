import { Prisma } from '@prisma/client';

export type Dec = Prisma.Decimal;
export const D = (v: Prisma.Decimal.Value | null | undefined): Dec => new Prisma.Decimal(v ?? 0);
export const money = (d: Dec): Dec => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const sum = (xs: (Prisma.Decimal.Value | null | undefined)[]): Dec => xs.reduce<Dec>((a, x) => a.plus(D(x)), D(0));

/** A vendor payment row as stored: only PAID rows count; a reversal row (reversalOfId set) takes money back out. */
export interface VendorPaymentRow { amount: Prisma.Decimal.Value; status?: string; reversalOfId?: string | null }
export const vendorPaid = (rows: VendorPaymentRow[]): Dec => rows.reduce<Dec>((a, p) => (p.status && p.status !== 'PAID' ? a : p.reversalOfId ? a.minus(D(p.amount)) : a.plus(D(p.amount))), D(0));

/** A client payment row as stored: SUCCEEDED (and fully refunded originals, which a reversal row then offsets) count; PENDING / PROCESSING / FAILED never do. */
export interface ClientPaymentRow { amount: Prisma.Decimal.Value; status?: string; reversalOfId?: string | null }
export const clientReceived = (rows: ClientPaymentRow[]): Dec => rows.reduce<Dec>((a, p) => {
  if (p.reversalOfId) return p.status && p.status !== 'SUCCEEDED' ? a : a.minus(D(p.amount));
  return p.status && p.status !== 'SUCCEEDED' && p.status !== 'REFUNDED' ? a : a.plus(D(p.amount));
}, D(0));

/** Decimal comparator helpers (never go through Number() for money). */
export const byDesc = <T,>(f: (x: T) => Dec) => (a: T, b: T) => f(b).comparedTo(f(a));
export const byAsc = <T,>(f: (x: T) => Dec) => (a: T, b: T) => f(a).comparedTo(f(b));

export interface QuoteLineInput { quantity: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value; taxRate?: Prisma.Decimal.Value; additionalCharge?: Prisma.Decimal.Value; included?: boolean }

/** Totals for a quotation. Excluded lines are listed on the quote but never priced into totals. */
export function computeQuotation(lines: QuoteLineInput[], guests?: number | null) {
  let subtotal = D(0), taxTotal = D(0), additionalTotal = D(0);
  const priced = lines.map((l) => {
    const total = money(D(l.quantity).times(D(l.unitPrice)));
    const tax = money(total.times(D(l.taxRate)).div(100));
    const extra = money(D(l.additionalCharge));
    if (l.included !== false) { subtotal = subtotal.plus(total); taxTotal = taxTotal.plus(tax); additionalTotal = additionalTotal.plus(extra); }
    return { total, tax, extra };
  });
  const grandTotal = money(subtotal.plus(taxTotal).plus(additionalTotal));
  const pricePerPlate = guests && guests > 0 ? money(grandTotal.div(guests)) : null;
  return { lines: priced, subtotal: money(subtotal), taxTotal: money(taxTotal), additionalTotal: money(additionalTotal), grandTotal, pricePerPlate };
}

/** Extra guests billed at the contracted per-plate rate. Never negative. */
export function extraGuestCharge(expected: number, actual: number, ratePerPlate: Prisma.Decimal.Value) {
  const extra = Math.max(0, actual - expected);
  return { extraGuests: extra, amount: money(D(ratePerPlate).times(extra)) };
}

export type MilestoneStatusT = 'UPCOMING' | 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
export function milestoneStatus(expected: Prisma.Decimal.Value, received: Prisma.Decimal.Value, dueDate: Date, now = new Date(), dueSoonDays = 7): MilestoneStatusT {
  const exp = D(expected), rec = D(received);
  if (rec.gte(exp) && exp.gt(0)) return 'PAID';
  if (now.getTime() > dueDate.getTime() + 24 * 3600 * 1000 - 1) return 'OVERDUE';
  if (rec.gt(0)) return 'PARTIALLY_PAID';
  if (dueDate.getTime() - now.getTime() <= dueSoonDays * 24 * 3600 * 1000) return 'DUE';
  return 'UPCOMING';
}

/** Vendor final bill: the actual invoice when entered (assumed to include extras), else negotiated + approved extras. */
export function vendorSettlement(p: { original: Prisma.Decimal.Value; negotiated: Prisma.Decimal.Value; actualInvoice?: Prisma.Decimal.Value | null; approvedExtras: Prisma.Decimal.Value; paid: Prisma.Decimal.Value; advance: Prisma.Decimal.Value }) {
  const finalBill = p.actualInvoice != null ? D(p.actualInvoice) : D(p.negotiated).plus(D(p.approvedExtras));
  const paid = D(p.paid);
  const remaining = finalBill.minus(paid);
  return {
    original: money(D(p.original)), negotiated: money(D(p.negotiated)), advance: money(D(p.advance)), approvedExtras: money(D(p.approvedExtras)),
    finalBill: money(finalBill), paid: money(paid), remainingPayable: money(remaining.lt(0) ? D(0) : remaining), overpaid: money(remaining.lt(0) ? remaining.neg() : D(0)),
  };
}

export function clientBilling(p: { contractValue: Prisma.Decimal.Value; approvedExtras: Prisma.Decimal.Value; received: Prisma.Decimal.Value }) {
  const final = D(p.contractValue).plus(D(p.approvedExtras));
  const out = final.minus(D(p.received));
  return { original: money(D(p.contractValue)), approvedExtras: money(D(p.approvedExtras)), finalAmount: money(final), received: money(D(p.received)), outstanding: money(out.lt(0) ? D(0) : out) };
}

export function profitability(p: { revenue: Prisma.Decimal.Value; vendorCosts: Prisma.Decimal.Value; teamCosts: Prisma.Decimal.Value; otherExpenses: Prisma.Decimal.Value; received: Prisma.Decimal.Value; vendorPaid: Prisma.Decimal.Value }) {
  const revenue = D(p.revenue);
  const gross = revenue.minus(D(p.vendorCosts));
  const net = gross.minus(D(p.teamCosts)).minus(D(p.otherExpenses));
  const margin = revenue.gt(0) ? net.div(revenue).times(100).toDecimalPlaces(1) : D(0);
  const rec = revenue.minus(D(p.received)), pay = D(p.vendorCosts).minus(D(p.vendorPaid));
  return {
    revenue: money(revenue), vendorCosts: money(D(p.vendorCosts)), teamCosts: money(D(p.teamCosts)), otherExpenses: money(D(p.otherExpenses)),
    grossProfit: money(gross), netProfit: money(net), marginPct: margin.toNumber(), received: money(D(p.received)), vendorPaid: money(D(p.vendorPaid)),
    receivables: money(rec.lt(0) ? D(0) : rec), payables: money(pay.lt(0) ? D(0) : pay),
  };
}

export interface Scorable { id: string; grandTotal: Prisma.Decimal.Value; rating: number; includedCount: number; totalCount: number; capacityOk: boolean }
/** Lowest total, best value (cost per included line, capacity-compliant) and a weighted recommendation — deliberately not always the cheapest. */
export function rankQuotations(qs: Scorable[]) {
  if (qs.length === 0) return { lowestId: null, bestValueId: null, recommendedId: null, scores: {} as Record<string, number> };
  const totals = qs.map((q) => D(q.grandTotal));
  const min = Prisma.Decimal.min(...totals);
  const lowestId = qs[totals.findIndex((t) => t.eq(min))].id;
  const eligible = qs.filter((q) => q.capacityOk);
  const pool = eligible.length ? eligible : qs;
  const perLine = (q: Scorable) => D(q.grandTotal).div(Math.max(1, q.includedCount));
  const bestValueId = pool.reduce((a, b) => (perLine(b).lt(perLine(a)) ? b : a)).id;
  const scores: Record<string, number> = {};
  for (const q of qs) {
    const price = min.div(D(q.grandTotal)).toNumber();
    const inclusions = q.totalCount ? q.includedCount / q.totalCount : 1;
    scores[q.id] = Math.round((0.4 * price + 0.3 * (q.rating / 5) + 0.2 * inclusions + 0.1 * (q.capacityOk ? 1 : 0)) * 1000) / 10;
  }
  const recommendedId = pool.reduce((a, b) => (scores[b.id] > scores[a.id] ? b : a)).id;
  return { lowestId, bestValueId, recommendedId, scores };
}
