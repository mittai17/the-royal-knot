import { Injectable } from '@nestjs/common';
import { Prisma, Role, TaskStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { byDesc, clientReceived, D, money, profitability, sum, vendorPaid, vendorSettlement } from '../../common/finance';
import { confirmedWeddingWhere } from '../../common/booking';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { WeddingsService } from '../weddings/weddings.service';

export interface WeddingFinancial {
  weddingId: string; name: string; location: string; startDate: Date; status: string; packageType: string; contractValue: Prisma.Decimal; additionalRevenue: Prisma.Decimal;
  bookingStatus: string; revenue: Prisma.Decimal; vendorCosts: Prisma.Decimal; teamCosts: Prisma.Decimal; otherExpenses: Prisma.Decimal; grossProfit: Prisma.Decimal; netProfit: Prisma.Decimal; marginPct: number;
  received: Prisma.Decimal; receivables: Prisma.Decimal; vendorPaid: Prisma.Decimal; payables: Prisma.Decimal;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService, private users: UsersService, private weddings: WeddingsService) {}

  /**
   * Bulk (no N+1) per-wedding financials built entirely from DB aggregates. Business totals (revenue, profit, receivables, season) count
   * CONFIRMED bookings only: drafts never inflate them. Asking for one weddingId always answers for that wedding (so a draft can be looked at).
   */
  async financials(weddingId?: string): Promise<WeddingFinancial[]> {
    const wf: Prisma.WeddingWhereInput = weddingId ? { id: weddingId } : { ...confirmedWeddingWhere(), status: { not: 'CANCELLED' as const } };
    const [weddings, payments, charges, expenses, wvs] = await Promise.all([
      this.prisma.wedding.findMany({ where: wf, select: { id: true, name: true, location: true, startDate: true, status: true, bookingStatus: true, packageType: true, contractValue: true } }),
      this.prisma.clientPayment.findMany({ where: weddingId ? { weddingId } : { wedding: wf }, select: { weddingId: true, amount: true, status: true, reversalOfId: true } }),
      this.prisma.additionalCharge.findMany({ where: { approved: true, ...(weddingId ? { reconciliation: { weddingId } } : { reconciliation: { wedding: wf } }) }, select: { amount: true, billToClient: true, weddingVendorId: true, reconciliation: { select: { weddingId: true } } } }),
      this.prisma.expense.groupBy({ by: ['weddingId', 'isTeamCost'], where: { status: 'APPROVED', reversalOfId: null, reversedAt: null, ...(weddingId ? { weddingId } : { wedding: wf }) }, _sum: { amount: true } }),
      this.prisma.weddingVendor.findMany({ where: weddingId ? { weddingId } : { wedding: wf }, include: { settlement: true, payments: { select: { amount: true, kind: true, status: true, reversalOfId: true } } } }),
    ]);
    return weddings.map((w) => {
      const wch = charges.filter((c) => c.reconciliation.weddingId === w.id);
      const additionalRevenue = sum(wch.filter((c) => c.billToClient).map((c) => c.amount));
      const bills = wvs.filter((v) => v.weddingId === w.id).map((v) => vendorSettlement({ original: v.contractAmount, negotiated: v.negotiatedAmount ?? v.contractAmount, actualInvoice: v.settlement?.actualInvoice, approvedExtras: sum(wch.filter((c) => c.weddingVendorId === v.id).map((c) => c.amount)), paid: vendorPaid(v.payments), advance: vendorPaid(v.payments.filter((p) => p.kind === 'ADVANCE')) }));
      const p = profitability({
        revenue: D(w.contractValue).plus(additionalRevenue), vendorCosts: sum(bills.map((b) => b.finalBill)), vendorPaid: sum(bills.map((b) => b.paid)),
        teamCosts: expenses.find((e) => e.weddingId === w.id && e.isTeamCost)?._sum.amount ?? 0, otherExpenses: expenses.find((e) => e.weddingId === w.id && !e.isTeamCost)?._sum.amount ?? 0,
        received: clientReceived(payments.filter((x) => x.weddingId === w.id)),
      });
      return { weddingId: w.id, name: w.name, location: w.location, startDate: w.startDate, status: w.status, bookingStatus: w.bookingStatus, packageType: w.packageType, contractValue: w.contractValue, additionalRevenue: money(additionalRevenue), ...p };
    });
  }

  async profitability(sort = 'netProfit', order: 'asc' | 'desc' = 'desc') {
    const rows = await this.financials();
    const key = sort as keyof WeddingFinancial;
    rows.sort((a, b) => { const x = a[key], y = b[key]; if (x instanceof Prisma.Decimal && y instanceof Prisma.Decimal) return order === 'desc' ? y.comparedTo(x) : x.comparedTo(y); const n = Number(x) - Number(y); return order === 'desc' ? -n : n; });
    return { weddings: rows, totals: this.totals(rows) };
  }

  private totals(rows: WeddingFinancial[]) {
    const revenue = sum(rows.map((r) => r.revenue)), vendor = sum(rows.map((r) => r.vendorCosts)), team = sum(rows.map((r) => r.teamCosts)), other = sum(rows.map((r) => r.otherExpenses));
    const net = revenue.minus(vendor).minus(team).minus(other);
    return {
      weddings: rows.length, revenue: money(revenue), additionalRevenue: money(sum(rows.map((r) => r.additionalRevenue))), vendorCosts: money(vendor), teamCosts: money(team), otherExpenses: money(other), totalExpenses: money(vendor.plus(team).plus(other)),
      grossProfit: money(revenue.minus(vendor)), netProfit: money(net), marginPct: revenue.gt(0) ? net.div(revenue).times(100).toDecimalPlaces(1).toNumber() : 0,
      received: money(sum(rows.map((r) => r.received))), receivables: money(sum(rows.map((r) => r.receivables))), vendorPaid: money(sum(rows.map((r) => r.vendorPaid))), payables: money(sum(rows.map((r) => r.payables))), averageWeddingValue: rows.length ? money(revenue.div(rows.length)) : D(0),
    };
  }

  private monthly(rows: WeddingFinancial[]) {
    const m = new Map<string, { month: string; revenue: Prisma.Decimal; received: Prisma.Decimal; outstanding: Prisma.Decimal; profit: Prisma.Decimal }>();
    for (const r of [...rows].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
      const k = r.startDate.toISOString().slice(0, 7);
      const e = m.get(k) ?? { month: k, revenue: D(0), received: D(0), outstanding: D(0), profit: D(0) };
      m.set(k, { month: k, revenue: e.revenue.plus(r.revenue), received: e.received.plus(r.received), outstanding: e.outstanding.plus(r.receivables), profit: e.profit.plus(r.netProfit) });
    }
    return [...m.values()];
  }

  async upcomingClientPayments(take = 10) {
    const rows = await this.prisma.paymentMilestone.findMany({ where: { status: { not: 'PAID' }, wedding: { ...confirmedWeddingWhere(), status: { not: 'CANCELLED' } } }, include: { payments: true, wedding: { select: { id: true, name: true } } }, orderBy: { dueDate: 'asc' }, take: 60 });
    return rows.map((r) => ({ id: r.id, weddingId: r.weddingId, wedding: r.wedding.name, type: r.type, dueDate: r.dueDate, expected: r.expectedAmount, received: clientReceived(r.payments) })).map((r) => ({ ...r, outstanding: money(D(r.expected).minus(r.received)), overdue: r.dueDate < new Date() })).filter((r) => r.outstanding.gt(0)).slice(0, take);
  }

  async upcomingVendorPayments(take = 10) {
    const wvs = await this.prisma.weddingVendor.findMany({ where: { wedding: { ...confirmedWeddingWhere(), status: { not: 'CANCELLED' } } }, include: { vendor: { select: { name: true } }, wedding: { select: { id: true, name: true, endDate: true } }, settlement: true, payments: { select: { amount: true, status: true, reversalOfId: true } } } });
    const charges = await this.prisma.additionalCharge.findMany({ where: { approved: true, weddingVendorId: { not: null } }, select: { weddingVendorId: true, amount: true } });
    return wvs.map((v) => {
      const b = vendorSettlement({ original: v.contractAmount, negotiated: v.negotiatedAmount ?? v.contractAmount, actualInvoice: v.settlement?.actualInvoice, approvedExtras: sum(charges.filter((c) => c.weddingVendorId === v.id).map((c) => c.amount)), paid: vendorPaid(v.payments), advance: 0 });
      return { weddingVendorId: v.id, weddingId: v.weddingId, wedding: v.wedding.name, vendor: v.vendor.name, category: v.category, dueDate: new Date(v.wedding.endDate.getTime() + 7 * 864e5), remainingPayable: b.remainingPayable, finalBill: b.finalBill };
    }).filter((x) => x.remainingPayable.gt(0)).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, take);
  }

  async overview() {
    const rows = await this.financials();
    const byMargin = [...rows].sort((a, b) => b.marginPct - a.marginPct);
    const status = await this.prisma.wedding.groupBy({ by: ['status'], where: confirmedWeddingWhere(), _count: true });
    return {
      totals: this.totals(rows), statusCounts: Object.fromEntries(status.map((s) => [s.status, s._count])), monthly: this.monthly(rows),
      mostProfitable: [...rows].sort(byDesc((x) => x.netProfit)).slice(0, 5), lowestMargin: byMargin.filter((r) => r.revenue.gt(0)).slice(-5).reverse(),
      upcomingClientPayments: await this.upcomingClientPayments(8), upcomingVendorPayments: await this.upcomingVendorPayments(8),
    };
  }

  async weddingFinancial(weddingId: string) { return (await this.financials(weddingId))[0] ?? null; }

  async vendors() {
    const vs = await this.prisma.vendor.findMany({ where: { active: true }, include: { weddingVendors: { include: { arrival: true, settlement: true } } }, orderBy: { name: 'asc' } });
    return vs.map((v) => {
      const arr = v.weddingVendors.filter((w) => w.arrival && w.arrival.status !== 'EXPECTED').map((w) => w.arrival!);
      const onTime = arr.filter((a) => a.delayMinutes <= 10).length;
      const settled = v.weddingVendors.filter((w) => w.settlement?.actualInvoice);
      const quoted = sum(settled.map((w) => w.settlement!.negotiated)), actual = sum(settled.map((w) => w.settlement!.actualInvoice));
      const variance = quoted.gt(0) ? actual.minus(quoted).div(quoted).times(100).toDecimalPlaces(1).toNumber() : null;
      const timeliness = arr.length ? Math.round((onTime / arr.length) * 100) : null;
      const reliability = Math.max(0, Math.min(100, Math.round((timeliness ?? 90) * 0.7 + (100 - Math.min(40, Math.max(0, variance ?? 0) * 4)) * 0.3)));
      return { id: v.id, name: v.name, category: v.category, rating: Number(v.rating), assignments: v.weddingVendors.length, arrivalsRecorded: arr.length, onTimeArrivals: onTime, timelinessPct: timeliness, avgDelayMinutes: arr.length ? Math.round(arr.reduce((a, x) => a + x.delayMinutes, 0) / arr.length) : 0, quoted: money(quoted), actual: money(actual), costVariancePct: variance, reliabilityScore: reliability, contractValue: money(sum(v.weddingVendors.map((w) => w.contractAmount))) };
    }).sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }

  team() { return this.users.workload(); }

  /** One round-trip for the dashboard screen. Finance numbers are omitted for roles that may not see them. */
  async dashboard(user: AuthUser) {
    const finance = this.weddings.canSeeFinance(user.role);
    const now = new Date();
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 864e5);
    const [activeWeddings, totalWeddings, activeEnquiries, vendors, taskGroups, overdue, recentEnquiries, recentActivity, ongoing, todayWedding] = await Promise.all([
      this.prisma.wedding.count({ where: { ...confirmedWeddingWhere(), status: { in: ['PLANNING', 'VENDOR_BOOKING', 'EVENT_DAY'] } } }),
      this.prisma.wedding.count({ where: { ...confirmedWeddingWhere(), status: { not: 'CANCELLED' } } }),
      this.prisma.enquiry.count({ where: { stage: { notIn: ['CONVERTED', 'LOST'] } } }),
      this.prisma.weddingVendor.findMany({ distinct: ['vendorId'], select: { vendorId: true } }),
      this.prisma.weddingTask.groupBy({ by: ['status'], _count: true }),
      this.prisma.weddingTask.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
      this.prisma.enquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { couple: true, assignedTo: { select: { name: true } } } }),
      this.prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { name: true } }, wedding: { select: { name: true } } } }),
      this.prisma.wedding.findMany({ where: { status: { in: ['PLANNING', 'VENDOR_BOOKING', 'EVENT_DAY'] } }, orderBy: { startDate: 'asc' }, take: 4, include: { planner: { select: { name: true } } } }),
      this.prisma.wedding.findFirst({ where: { OR: [{ status: 'EVENT_DAY' }, { startDate: { lt: dayEnd }, endDate: { gte: dayStart } }], status: { not: 'CANCELLED' } }, orderBy: { status: 'desc' }, select: { id: true, name: true } }),
    ]);
    const progress = await this.weddings.progressFor(ongoing.map((w) => w.id));
    const tasks = Object.fromEntries(Object.values(TaskStatus).map((s) => [s, taskGroups.find((g) => g.status === s)?._count ?? 0]));
    const [schedule, arrivals] = todayWedding
      ? await Promise.all([
          this.prisma.timelineItem.findMany({ where: { weddingId: todayWedding.id, scheduledAt: { gte: dayStart, lt: dayEnd } }, orderBy: { scheduledAt: 'asc' } }),
          this.prisma.weddingVendor.findMany({ where: { weddingId: todayWedding.id, arrival: { isNot: null } }, include: { vendor: { select: { name: true } }, arrival: true }, take: 6 }),
        ])
      : [[], []];
    const base = {
      kpis: { totalWeddings, activeWeddings, activeEnquiries, activeVendors: vendors.length, pendingTasks: Object.entries(tasks).filter(([k]) => k !== 'COMPLETED').reduce((a, [, v]) => a + (v as number), 0), overdueTasks: overdue },
      ongoingWeddings: ongoing.map((w) => ({ id: w.id, name: w.name, location: w.location, venue: w.venue, startDate: w.startDate, endDate: w.endDate, status: w.status, expectedGuests: w.expectedGuests, budget: finance ? w.budget : null, progress: progress[w.id] ?? 0, planner: w.planner?.name })),
      taskOverview: { total: Object.values(tasks).reduce((a, v) => a + (v as number), 0), byStatus: tasks, overdue },
      today: { wedding: todayWedding, schedule, vendorStatus: arrivals }, recentEnquiries: recentEnquiries.map((e) => ({ id: e.id, couple: `${e.couple.brideName} & ${e.couple.groomName}`, preferredDate: e.preferredDate, location: e.location, budget: e.budget, stage: e.stage, assignedTo: e.assignedTo?.name })),
      recentActivity: recentActivity.map((a) => ({ id: a.id, message: a.message, at: a.createdAt, actor: a.actor?.name, wedding: a.wedding?.name })),
    };
    if (!finance) return { ...base, finance: null };
    const rows = await this.financials();
    const t = this.totals(rows);
    return { ...base, finance: { contractedRevenue: t.revenue, received: t.received, receivedPct: D(t.revenue).gt(0) ? D(t.received).div(t.revenue).times(100).toDecimalPlaces(0).toNumber() : 0, netProfit: t.netProfit, marginPct: t.marginPct, totalExpenses: t.totalExpenses, monthly: this.monthly(rows), upcomingPayments: await this.upcomingClientPayments(4) } };
  }

  async search(q: string, role: Role) {
    const term = q.trim();
    if (term.length < 2) return { weddings: [], vendors: [], enquiries: [], guests: [], tasks: [] };
    const ci = { contains: term, mode: 'insensitive' as const };
    const [weddings, vendors, enquiries, guests, tasks] = await Promise.all([
      this.prisma.wedding.findMany({ where: { OR: [{ name: ci }, { location: ci }, { venue: ci }, { couple: { OR: [{ brideName: ci }, { groomName: ci }] } }] }, select: { id: true, name: true, location: true, status: true }, take: 5 }),
      this.prisma.vendor.findMany({ where: { OR: [{ name: ci }, { businessName: ci }, { contactName: ci }] }, select: { id: true, name: true, category: true }, take: 5 }),
      this.prisma.enquiry.findMany({ where: { OR: [{ location: ci }, { couple: { OR: [{ brideName: ci }, { groomName: ci }, { phone: { contains: term } }] } }] }, select: { id: true, stage: true, couple: { select: { brideName: true, groomName: true } } }, take: 5 }),
      this.prisma.guest.findMany({ where: { OR: [{ name: ci }, { phone: { contains: term } }] }, select: { id: true, name: true, weddingId: true, wedding: { select: { name: true } } }, take: 5 }),
      this.prisma.weddingTask.findMany({ where: { name: ci }, select: { id: true, name: true, weddingId: true, status: true }, take: 5 }),
    ]);
    return { weddings, vendors, enquiries, guests, tasks, role };
  }
}
