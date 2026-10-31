import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { D, money, sum } from '../../common/finance';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { invoiceStatus, outstanding } from '../invoices/invoice-math';
import { billStatus } from '../vendor-bills/bill-math';
import { monthKey, titleCat } from './budget-math';

export const REPORTS = ['summary', 'profitability', 'receivables', 'vendor-payments', 'expense-analysis', 'gst', 'season'] as const;
export type ReportName = (typeof REPORTS)[number];
export interface Range { from?: Date; to?: Date }

const inRange = (d: Date, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
const bucket = (days: number) => (days <= 0 ? 'Current' : days <= 30 ? '1-30 days' : days <= 60 ? '31-60 days' : days <= 90 ? '61-90 days' : '90+ days');
const BUCKETS = ['Current', '1-30 days', '31-60 days', '61-90 days', '90+ days'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Injectable()
export class FinancialReportsService {
  constructor(private prisma: PrismaService, private analytics: AnalyticsService) {}

  parseRange(from?: string, to?: string): Range {
    const f = from ? new Date(from) : undefined, t = to ? new Date(to) : undefined;
    if ((f && isNaN(f.getTime())) || (t && isNaN(t.getTime()))) throw new BadRequestException('from / to must be dates (YYYY-MM-DD)');
    if (t) t.setUTCHours(23, 59, 59, 999);
    return { from: f, to: t };
  }

  async run(name: ReportName, r: Range) {
    switch (name) {
      case 'summary': return this.summary(r);
      case 'profitability': return this.profitability(r);
      case 'receivables': return this.receivables(r);
      case 'vendor-payments': return this.vendorPayments(r);
      case 'expense-analysis': return this.expenseAnalysis(r);
      case 'gst': return this.gst(r);
      case 'season': return this.season(r);
    }
  }

  private async weddingsFin(r: Range) { return (await this.analytics.financials()).filter((w) => inRange(w.startDate, r)); }

  async summary(r: Range) {
    const [p, rec, vp, gst] = await Promise.all([this.profitability(r), this.receivables(r), this.vendorPayments(r), this.gst(r)]);
    return { range: r, profitability: p.totals, receivables: rec.totals, vendorPayments: vp.totals, gst: gst.totals };
  }

  async profitability(r: Range) {
    const rows = (await this.weddingsFin(r)).sort((a, b) => Number(b.netProfit.minus(a.netProfit)));
    const revenue = sum(rows.map((x) => x.revenue)), net = sum(rows.map((x) => x.netProfit));
    return {
      rows: rows.map((x) => ({ wedding: x.name, location: x.location, date: x.startDate, status: x.status, package: x.packageType, revenue: x.revenue, vendorCosts: x.vendorCosts, teamCosts: x.teamCosts, otherExpenses: x.otherExpenses, grossProfit: x.grossProfit, netProfit: x.netProfit, marginPct: x.marginPct })),
      totals: { weddings: rows.length, revenue: money(revenue), vendorCosts: money(sum(rows.map((x) => x.vendorCosts))), expenses: money(sum(rows.map((x) => x.teamCosts.plus(x.otherExpenses)))), netProfit: money(net), marginPct: revenue.gt(0) ? net.div(revenue).times(100).toDecimalPlaces(1).toNumber() : 0 },
    };
  }

  /** Outstanding client money: unpaid milestones and open invoices, aged by due date. */
  async receivables(r: Range) {
    const now = new Date();
    const [ms, invs] = await Promise.all([
      this.prisma.paymentMilestone.findMany({ where: { wedding: { status: { not: 'CANCELLED' } } }, include: { payments: { select: { amount: true } }, wedding: { select: { name: true } } } }),
      this.prisma.clientInvoice.findMany({ where: { status: { notIn: ['DRAFT', 'VOID'] } }, include: { wedding: { select: { name: true } } } }),
    ]);
    const rows: { source: string; reference: string; wedding: string; dueDate: Date | null; total: Prisma.Decimal; paid: Prisma.Decimal; outstanding: Prisma.Decimal; daysOverdue: number; ageing: string; status: string }[] = [];
    for (const m of ms) {
      const paid = sum(m.payments.map((p) => p.amount)), out = D(m.expectedAmount).minus(paid);
      if (out.lte(0) || !inRange(m.dueDate, r)) continue;
      const days = Math.floor((now.getTime() - m.dueDate.getTime()) / 864e5);
      rows.push({ source: 'Milestone', reference: m.type, wedding: m.wedding.name, dueDate: m.dueDate, total: D(m.expectedAmount), paid, outstanding: money(out), daysOverdue: Math.max(0, days), ageing: bucket(days), status: days > 0 ? 'OVERDUE' : 'OPEN' });
    }
    for (const i of invs) {
      const out = outstanding(i.total, i.amountPaid);
      if (out.lte(0) || (i.dueDate && !inRange(i.dueDate, r))) continue;
      const days = i.dueDate ? Math.floor((now.getTime() - i.dueDate.getTime()) / 864e5) : 0;
      rows.push({ source: 'Invoice', reference: i.invoiceNo, wedding: i.wedding.name, dueDate: i.dueDate, total: D(i.total), paid: D(i.amountPaid), outstanding: out, daysOverdue: Math.max(0, days), ageing: bucket(days), status: invoiceStatus(i, now) });
    }
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return {
      rows,
      ageing: BUCKETS.map((b) => ({ bucket: b, count: rows.filter((x) => x.ageing === b).length, outstanding: money(sum(rows.filter((x) => x.ageing === b).map((x) => x.outstanding))) })),
      totals: { outstanding: money(sum(rows.map((x) => x.outstanding))), overdue: money(sum(rows.filter((x) => x.daysOverdue > 0).map((x) => x.outstanding))), items: rows.length },
      note: 'Invoices and milestones can describe the same money; milestone rows not covered by an invoice and invoice rows are both listed, so check the source column before summing across them.',
    };
  }

  async vendorPayments(r: Range) {
    const now = new Date();
    const [wvs, bills, charges] = await Promise.all([
      this.prisma.weddingVendor.findMany({ where: { wedding: { status: { not: 'CANCELLED' } } }, include: { vendor: { select: { name: true } }, wedding: { select: { name: true, startDate: true } }, settlement: true, payments: { select: { amount: true, paidAt: true } } } }),
      this.prisma.vendorBill.findMany({ include: { vendor: { select: { name: true } } } }),
      this.prisma.additionalCharge.findMany({ where: { approved: true, weddingVendorId: { not: null } }, select: { weddingVendorId: true, amount: true } }),
    ]);
    const rows = wvs.filter((w) => inRange(w.wedding.startDate, r)).map((w) => {
      const committed = D(w.negotiatedAmount ?? w.contractAmount), extras = sum(charges.filter((c) => c.weddingVendorId === w.id).map((c) => c.amount));
      const billed = w.settlement?.actualInvoice != null ? D(w.settlement.actualInvoice) : committed.plus(extras), paid = sum(w.payments.map((p) => p.amount));
      return { vendor: w.vendor.name, wedding: w.wedding.name, category: titleCat(w.category), committed: money(committed), billed: money(billed), paid: money(paid), remaining: money(billed.minus(paid).lt(0) ? D(0) : billed.minus(paid)), settlement: w.settlement?.status ?? 'PENDING' };
    }).sort((a, b) => Number(b.remaining.minus(a.remaining)));
    const open = bills.filter((b) => !['PAID', 'REJECTED'].includes(billStatus(b, now)));
    const apAgeing = BUCKETS.map((bk) => {
      const xs = open.filter((b) => bucket(b.dueDate ? Math.floor((now.getTime() - b.dueDate.getTime()) / 864e5) : 0) === bk);
      return { bucket: bk, count: xs.length, outstanding: money(sum(xs.map((b) => D(b.total).minus(b.amountPaid)))) };
    });
    return {
      rows, apAgeing,
      totals: { committed: money(sum(rows.map((x) => x.committed))), billed: money(sum(rows.map((x) => x.billed))), paid: money(sum(rows.map((x) => x.paid))), remaining: money(sum(rows.map((x) => x.remaining))), billsOutstanding: money(sum(open.map((b) => D(b.total).minus(b.amountPaid)))), billsOverdue: open.filter((b) => billStatus(b, now) === 'OVERDUE').length },
    };
  }

  async expenseAnalysis(r: Range) {
    const exps = await this.prisma.expense.findMany({ where: { ...(r.from || r.to ? { date: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lte: r.to } : {}) } } : {}) }, select: { category: true, amount: true, date: true, status: true, isTeamCost: true } });
    const approved = exps.filter((e) => e.status === 'APPROVED');
    const total = sum(approved.map((e) => e.amount));
    const cats = new Map<string, { category: string; amount: Prisma.Decimal; count: number }>();
    approved.forEach((e) => { const k = e.category.trim().toLowerCase(); const c = cats.get(k) ?? { category: titleCat(e.category), amount: D(0), count: 0 }; cats.set(k, { ...c, amount: c.amount.plus(e.amount), count: c.count + 1 }); });
    const rows = [...cats.values()].sort((a, b) => Number(b.amount.minus(a.amount))).map((c) => ({ category: c.category, count: c.count, amount: money(c.amount), sharePct: total.gt(0) ? c.amount.div(total).times(100).toDecimalPlaces(1).toNumber() : 0 }));
    const monthly = new Map<string, Prisma.Decimal>();
    approved.forEach((e) => monthly.set(monthKey(e.date), (monthly.get(monthKey(e.date)) ?? D(0)).plus(e.amount)));
    return {
      rows, monthly: [...monthly.entries()].sort().map(([month, amount]) => ({ month, amount: money(amount) })),
      totals: { approved: money(total), pending: money(sum(exps.filter((e) => e.status === 'PENDING').map((e) => e.amount))), rejected: money(sum(exps.filter((e) => e.status === 'REJECTED').map((e) => e.amount))), teamCosts: money(sum(approved.filter((e) => e.isTeamCost).map((e) => e.amount))), count: approved.length },
    };
  }

  /** GST from documents we hold: tax on issued client invoices (output) and on accepted vendor bills (input). */
  async gst(r: Range) {
    const [invs, bills] = await Promise.all([
      this.prisma.clientInvoice.findMany({ where: { status: { notIn: ['DRAFT', 'VOID'] } }, select: { issueDate: true, taxTotal: true, subtotal: true } }),
      this.prisma.vendorBill.findMany({ where: { status: { in: ['VERIFIED', 'APPROVED', 'PAID', 'OVERDUE'] } }, select: { billDate: true, taxTotal: true, subtotal: true } }),
    ]);
    const m = new Map<string, { month: string; outputTax: Prisma.Decimal; inputTax: Prisma.Decimal; taxableSales: Prisma.Decimal; taxablePurchases: Prisma.Decimal }>();
    const row = (k: string) => m.get(k) ?? { month: k, outputTax: D(0), inputTax: D(0), taxableSales: D(0), taxablePurchases: D(0) };
    invs.filter((i) => inRange(i.issueDate, r)).forEach((i) => { const k = monthKey(i.issueDate); const c = row(k); m.set(k, { ...c, outputTax: c.outputTax.plus(i.taxTotal), taxableSales: c.taxableSales.plus(i.subtotal) }); });
    bills.filter((b) => inRange(b.billDate, r)).forEach((b) => { const k = monthKey(b.billDate); const c = row(k); m.set(k, { ...c, inputTax: c.inputTax.plus(b.taxTotal), taxablePurchases: c.taxablePurchases.plus(b.subtotal) }); });
    const rows = [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).map((x) => ({ month: x.month, taxableSales: money(x.taxableSales), outputTax: money(x.outputTax), taxablePurchases: money(x.taxablePurchases), inputTax: money(x.inputTax), netPayable: money(x.outputTax.minus(x.inputTax)) }));
    return {
      rows, totals: { outputTax: money(sum(rows.map((x) => x.outputTax))), inputTax: money(sum(rows.map((x) => x.inputTax))), netPayable: money(sum(rows.map((x) => x.netPayable))) },
      note: 'Based on issued client invoices and verified vendor bills only. Payments recorded without an invoice carry no tax split here.',
    };
  }

  /** Performance by calendar month of the wedding (the wedding season). */
  async season(r: Range) {
    const rows = await this.weddingsFin(r);
    const wed = await this.prisma.wedding.findMany({ where: { id: { in: rows.map((x) => x.weddingId) } }, select: { id: true, expectedGuests: true } });
    const guests = new Map(wed.map((w) => [w.id, w.expectedGuests]));
    const out = MONTHS.map((name, idx) => {
      const xs = rows.filter((x) => x.startDate.getUTCMonth() === idx);
      const revenue = sum(xs.map((x) => x.revenue)), net = sum(xs.map((x) => x.netProfit));
      return { month: name, weddings: xs.length, revenue: money(revenue), netProfit: money(net), marginPct: revenue.gt(0) ? net.div(revenue).times(100).toDecimalPlaces(1).toNumber() : 0, avgGuests: xs.length ? Math.round(xs.reduce((a, x) => a + (guests.get(x.weddingId) ?? 0), 0) / xs.length) : 0, avgValue: xs.length ? money(revenue.div(xs.length)) : money(D(0)) };
    });
    const best = [...out].filter((x) => x.weddings).sort((a, b) => Number(b.netProfit.minus(a.netProfit)))[0];
    return { rows: out, totals: { weddings: rows.length, peakMonth: best?.month ?? null } };
  }
}
