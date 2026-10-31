import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, money, sum } from '../../common/finance';
import { inr } from '../../common/pdf-templates';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { BudgetItemDto, CreateBudgetDto, UpdateBudgetDto } from './budgets.dto';
import { FlowEvent, monthKey, monthRange, normCat, rollMonths, titleCat, variance } from './budget-math';

const include = { items: { orderBy: { category: 'asc' } }, wedding: { select: { id: true, name: true, status: true, startDate: true } } } satisfies Prisma.BudgetInclude;

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private analytics: AnalyticsService, private approvals: ApprovalsService) {}

  /** What each wedding vendor will cost: actual invoice if settled, else negotiated, plus approved extras. */
  private async vendorCosts(weddingId?: string) {
    const [wvs, charges] = await Promise.all([
      this.prisma.weddingVendor.findMany({ where: { ...(weddingId ? { weddingId } : {}), wedding: { status: { not: 'CANCELLED' } } }, include: { vendor: { select: { id: true, name: true } }, settlement: true, payments: { select: { amount: true } } } }),
      this.prisma.additionalCharge.findMany({ where: { approved: true, weddingVendorId: { not: null }, ...(weddingId ? { reconciliation: { weddingId } } : {}) }, select: { weddingVendorId: true, amount: true } }),
    ]);
    return wvs.map((w) => {
      const committed = D(w.negotiatedAmount ?? w.contractAmount);
      const extras = sum(charges.filter((c) => c.weddingVendorId === w.id).map((c) => c.amount));
      const billed = w.settlement?.actualInvoice != null ? D(w.settlement.actualInvoice) : committed.plus(extras);
      return { id: w.id, weddingId: w.weddingId, vendorId: w.vendorId, vendor: w.vendor.name, category: w.category as string, committed, billed, paid: sum(w.payments.map((p) => p.amount)) };
    });
  }

  /** Latest budget version per wedding. */
  private async latestBudgets(weddingId?: string) {
    const all = await this.prisma.budget.findMany({ where: weddingId ? { weddingId } : {}, include: { items: true }, orderBy: [{ weddingId: 'asc' }, { version: 'desc' }] });
    const seen = new Set<string>();
    return all.filter((b) => (seen.has(b.weddingId) ? false : (seen.add(b.weddingId), true)));
  }

  /** Budgets & profitability: overall, by wedding, by category and by vendor. */
  async overview(weddingId?: string) {
    const [fin, budgets, lines, vcs, expenses] = await Promise.all([
      this.analytics.financials(weddingId),
      this.latestBudgets(weddingId),
      this.prisma.budgetLine.findMany({ where: weddingId ? { weddingId } : {} }),
      this.vendorCosts(weddingId),
      this.prisma.expense.groupBy({ by: ['weddingId', 'category'], where: { status: 'APPROVED', ...(weddingId ? { weddingId } : {}) }, _sum: { amount: true } }),
    ]);
    const plannedFor = (wid: string) => {
      const b = budgets.find((x) => x.weddingId === wid);
      if (b) return { source: `Budget v${b.version}`, items: b.items.map((i) => ({ category: i.category, planned: D(i.plannedAmount) })) };
      return { source: 'Planned lines', items: lines.filter((l) => l.weddingId === wid).map((l) => ({ category: l.category, planned: D(l.plannedAmount) })) };
    };
    const byWedding = fin.map((f) => {
      const pl = plannedFor(f.weddingId);
      const planned = sum(pl.items.map((i) => i.planned));
      const committed = sum(vcs.filter((v) => v.weddingId === f.weddingId).map((v) => v.committed));
      const actual = f.vendorCosts.plus(f.teamCosts).plus(f.otherExpenses);
      return { weddingId: f.weddingId, name: f.name, status: f.status, startDate: f.startDate, budgetSource: pl.source, planned: money(planned), committed: money(committed), actual: money(actual), revenue: f.revenue, profit: f.netProfit, marginPct: f.marginPct, received: f.received, ...variance(planned, actual) };
    }).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

    const cats = new Map<string, { category: string; planned: Prisma.Decimal; committed: Prisma.Decimal; actual: Prisma.Decimal }>();
    const bump = (cat: string, k: 'planned' | 'committed' | 'actual', v: Prisma.Decimal.Value) => {
      const key = normCat(cat); const cur = cats.get(key) ?? { category: titleCat(cat), planned: D(0), committed: D(0), actual: D(0) };
      cur[k] = cur[k].plus(D(v)); cats.set(key, cur);
    };
    // Planned-vs-actual is only meaningful where a plan exists, so category figures cover budgeted weddings only.
    const budgeted = new Set(byWedding.filter((w) => w.planned.gt(0)).map((w) => w.weddingId));
    for (const f of fin) if (budgeted.has(f.weddingId)) plannedFor(f.weddingId).items.forEach((i) => bump(i.category, 'planned', i.planned));
    vcs.filter((v) => budgeted.has(v.weddingId)).forEach((v) => { bump(v.category, 'committed', v.committed); bump(v.category, 'actual', v.billed); });
    expenses.filter((e) => budgeted.has(e.weddingId)).forEach((e) => bump(e.category, 'actual', e._sum.amount ?? 0));
    const byCategory = [...cats.values()].map((c) => ({ ...c, planned: money(c.planned), committed: money(c.committed), actual: money(c.actual), ...variance(c.planned, c.actual) })).sort((a, b) => Number(b.actual.minus(a.actual)));

    const vend = new Map<string, { vendorId: string; vendor: string; bookings: number; committed: Prisma.Decimal; billed: Prisma.Decimal; paid: Prisma.Decimal }>();
    for (const v of vcs) {
      const cur = vend.get(v.vendorId) ?? { vendorId: v.vendorId, vendor: v.vendor, bookings: 0, committed: D(0), billed: D(0), paid: D(0) };
      vend.set(v.vendorId, { ...cur, bookings: cur.bookings + 1, committed: cur.committed.plus(v.committed), billed: cur.billed.plus(v.billed), paid: cur.paid.plus(v.paid) });
    }
    const byVendor = [...vend.values()].map((v) => ({ ...v, committed: money(v.committed), billed: money(v.billed), paid: money(v.paid), remaining: money(v.billed.minus(v.paid).lt(0) ? D(0) : v.billed.minus(v.paid)) })).sort((a, b) => Number(b.billed.minus(a.billed)));

    const revenue = sum(fin.map((f) => f.revenue)), cost = sum(fin.map((f) => f.vendorCosts.plus(f.teamCosts).plus(f.otherExpenses)));
    const planned = sum(byWedding.map((w) => w.planned));
    const budgetedActual = sum(byWedding.filter((w) => w.planned.gt(0)).map((w) => w.actual));
    return {
      totals: { weddings: fin.length, budgetedWeddings: budgeted.size, revenue: money(revenue), planned: money(planned), budgetedActual: money(budgetedActual), committed: money(sum(vcs.map((v) => v.committed))), actual: money(cost), profit: money(revenue.minus(cost)), marginPct: revenue.gt(0) ? revenue.minus(cost).div(revenue).times(100).toDecimalPlaces(1).toNumber() : 0, ...variance(planned, budgetedActual) },
      byWedding, byCategory, byVendor,
    };
  }

  async listForWedding(weddingId: string) {
    if (!(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
    const versions = await this.prisma.budget.findMany({ where: { weddingId }, include, orderBy: { version: 'desc' } });
    const ov = await this.overview(weddingId);
    return { versions, current: versions[0] ?? null, live: ov.byCategory, totals: ov.totals };
  }

  private cleanItems(items: BudgetItemDto[]) {
    const seen = new Set<string>();
    for (const i of items) { const k = normCat(i.category); if (!k) throw new BadRequestException('Every line needs a category'); if (seen.has(k)) throw new BadRequestException(`Category "${i.category}" appears twice`); seen.add(k); }
    return items.map((i) => ({ category: i.category.trim(), description: i.description, plannedAmount: money(D(i.plannedAmount)) }));
  }

  /** New budget version. A higher total than the previous version raises an approval request (informational, does not block). */
  async create(dto: CreateBudgetDto, actor: AuthUser) {
    if (!(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    const items = this.cleanItems(dto.items);
    const total = sum(items.map((i) => i.plannedAmount));
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'Budget:' + dto.weddingId}))`;
      const prev = await tx.budget.findFirst({ where: { weddingId: dto.weddingId }, orderBy: { version: 'desc' } });
      const b = await tx.budget.create({ data: { weddingId: dto.weddingId, version: (prev?.version ?? 0) + 1, name: dto.name ?? 'Working budget', notes: dto.notes, total, createdById: actor.id, items: { create: items } }, include });
      await this.audit.log({ actorId: actor.id, weddingId: dto.weddingId, entity: 'Budget', entityId: b.id, action: 'create', message: `Created budget v${b.version} (${inr(total)})` }, tx);
      if (prev && total.gt(prev.total)) {
        await this.approvals.requestFor({ type: 'OTHER', title: `Budget increase: ${b.wedding.name}`, description: `v${prev.version} ${inr(prev.total)} → v${b.version} ${inr(total)}`, amount: money(total.minus(prev.total)), weddingId: dto.weddingId, entity: 'Budget', entityId: b.id }, actor, tx);
      }
      return b;
    });
    return out;
  }

  async update(id: string, dto: UpdateBudgetDto, actor: AuthUser) {
    const cur = await this.prisma.budget.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Budget not found');
    const items = dto.items ? this.cleanItems(dto.items) : null;
    const b = await this.prisma.$transaction(async (tx) => {
      if (items) await tx.budgetItem.deleteMany({ where: { budgetId: id } });
      const u = await tx.budget.update({ where: { id }, data: { name: dto.name, notes: dto.notes, ...(items ? { total: sum(items.map((i) => i.plannedAmount)), items: { create: items } } : {}) }, include });
      await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'Budget', entityId: id, action: 'update', message: `Updated budget v${cur.version} (${inr(u.total)})` }, tx);
      return u;
    });
    return b;
  }

  /**
   * Cash flow by month. Actuals: client payments in, vendor payments + approved expenses out. Forecast (this month onwards, overdue amounts
   * roll into the current month): unpaid payment milestones in, remaining vendor payables + unpaid bills not tied to a booked vendor out.
   */
  async cashFlow(weddingId: string | undefined, back = 6, ahead = 6) {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)), last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + ahead + 1, 0));
    const thisMonth = monthKey(now);
    const w = weddingId ? { weddingId } : {};
    const [pays, vpays, exps, ms, vcs, bills, weds] = await Promise.all([
      this.prisma.clientPayment.findMany({ where: { ...w, paidAt: { gte: first, lte: last } }, select: { amount: true, paidAt: true } }),
      this.prisma.vendorPayment.findMany({ where: { ...w, paidAt: { gte: first, lte: last } }, select: { amount: true, paidAt: true } }),
      this.prisma.expense.findMany({ where: { ...w, status: 'APPROVED', date: { gte: first, lte: last } }, select: { amount: true, date: true } }),
      this.prisma.paymentMilestone.findMany({ where: { ...w, wedding: { status: { not: 'CANCELLED' } } }, include: { payments: { select: { amount: true } } } }),
      this.vendorCosts(weddingId),
      this.prisma.vendorBill.findMany({ where: { ...w, status: { in: ['SUBMITTED', 'VERIFIED', 'APPROVED', 'OVERDUE'] } }, select: { id: true, total: true, amountPaid: true, dueDate: true, billDate: true, weddingId: true, vendorId: true } }),
      this.prisma.wedding.findMany({ where: { ...(weddingId ? { id: weddingId } : {}), status: { not: 'CANCELLED' } }, select: { id: true, endDate: true } }),
    ]);
    const clamp = (d: Date) => { const k = monthKey(d); return k < thisMonth ? thisMonth : k; }; // overdue / past-due forecasts land in the current month
    const ev: FlowEvent[] = [];
    pays.forEach((p) => ev.push({ month: monthKey(p.paidAt), inflow: D(p.amount), forecast: false }));
    vpays.forEach((p) => ev.push({ month: monthKey(p.paidAt), outflow: D(p.amount), forecast: false }));
    exps.forEach((e) => ev.push({ month: monthKey(e.date), outflow: D(e.amount), forecast: false }));
    for (const m of ms) {
      const out = D(m.expectedAmount).minus(sum(m.payments.map((p) => p.amount)));
      if (out.gt(0)) ev.push({ month: clamp(m.dueDate), inflow: out, forecast: true });
    }
    const endOf = new Map(weds.map((x) => [x.id, x.endDate]));
    const wvIds = new Set(vcs.map((v) => `${v.weddingId}:${v.vendorId}`));
    for (const v of vcs) {
      const rem = v.billed.minus(v.paid);
      const end = endOf.get(v.weddingId);
      if (rem.gt(0) && end) ev.push({ month: clamp(new Date(end.getTime() + 7 * 864e5)), outflow: rem, forecast: true });
    }
    for (const b of bills) {
      if (b.weddingId && wvIds.has(`${b.weddingId}:${b.vendorId}`)) continue; // already counted in the vendor's remaining payable
      const rem = D(b.total).minus(b.amountPaid);
      if (rem.gt(0)) ev.push({ month: clamp(b.dueDate ?? new Date(b.billDate.getTime() + 30 * 864e5)), outflow: rem, forecast: true });
    }
    const months = rollMonths(monthRange(first, last), ev).map((r) => ({ ...r, isForecast: r.month > thisMonth, isCurrent: r.month === thisMonth }));
    const past = months.filter((m) => m.month <= thisMonth);
    return {
      currentMonth: thisMonth, months,
      totals: {
        inflowActual: money(sum(months.map((m) => m.inflowActual))), outflowActual: money(sum(months.map((m) => m.outflowActual))), inflowForecast: money(sum(months.map((m) => m.inflowForecast))), outflowForecast: money(sum(months.map((m) => m.outflowForecast))),
        net: money(sum(months.map((m) => m.net))), netToDate: money(sum(past.map((m) => m.inflowActual.minus(m.outflowActual)))),
      },
      notes: 'Forecast inflow = unpaid client milestones by due date; forecast outflow = remaining vendor payables (a week after the wedding) plus unpaid vendor bills not tied to a booked vendor. Overdue amounts roll into the current month.',
    };
  }
}
