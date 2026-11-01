import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { byDesc, D, money, sum } from '../../common/finance';
import { assertDifferentPerson, creatorOf, financeLimits } from '../../common/finance-policy';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { inr } from '../../common/pdf-templates';
import { vendorBill } from '../../common/vendor-bill';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto, DecideExpenseDto, ExpenseQuery, SetBudgetDto, UpdateExpenseDto } from './expenses.dto';

const include = { wedding: { select: { id: true, name: true } }, vendor: { select: { id: true, name: true } }, responsible: { select: { id: true, name: true } } } satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private approvals: ApprovalsService) {}

  async list(q: ExpenseQuery) {
    const where: Prisma.ExpenseWhereInput = { ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}), ...(q.vendorId ? { vendorId: q.vendorId } : {}), ...(q.search ? { description: { contains: q.search, mode: 'insensitive' } } : {}) };
    const [items, total, agg] = await Promise.all([
      this.prisma.expense.findMany({ where, include, orderBy: orderBy(q, ['date', 'amount', 'category', 'status', 'createdAt'], 'date'), ...skipTake(q) }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.groupBy({ by: ['status'], where: { ...where, reversalOfId: null, reversedAt: null }, _sum: { amount: true } }),
    ]);
    const p = new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
    (p.meta as Record<string, unknown>).totals = Object.fromEntries(agg.map((a) => [a.status, a._sum.amount]));
    return p;
  }

  async create(dto: CreateExpenseDto, actor: AuthUser) {
    const e = await this.prisma.expense.create({ data: { ...dto, date: new Date(dto.date), responsibleId: dto.responsibleId ?? actor.id }, include });
    await this.audit.log({ actorId: actor.id, weddingId: e.weddingId, entity: 'Expense', entityId: e.id, action: 'create', message: `Logged expense ${inr(e.amount)} — ${e.description}` });
    // Large extra expenses also show up in the Approvals Centre (the Expenses screen decision stays authoritative and is kept in sync).
    const limit = (await financeLimits(this.prisma)).extraExpense;
    if (e.status === 'PENDING' && D(e.amount).gte(limit)) {
      await this.approvals.requestFor({ type: 'EXTRA_EXPENSE', title: `Expense: ${e.description}`, description: `${e.category} · logged by ${actor.name}`, reason: `Expense of ${inr(e.amount)} is at or above the ${inr(limit)} approval limit`, amount: e.amount, weddingId: e.weddingId, entity: 'Expense', entityId: e.id, sourceModule: 'expenses', sourceId: e.id, supportingDocumentId: e.receiptDocumentId }, actor).catch(() => undefined);
    }
    return e;
  }

  async update(id: string, dto: UpdateExpenseDto, actor: AuthUser) {
    const prev = await this.prisma.expense.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Expense not found');
    if (prev.status === 'APPROVED') throw new BadRequestException('Approved expenses are locked — reject or re-log instead');
    const e = await this.prisma.expense.update({ where: { id }, data: { ...dto, ...(dto.date ? { date: new Date(dto.date) } : {}) }, include });
    await this.audit.log({ actorId: actor.id, weddingId: e.weddingId, entity: 'Expense', entityId: id, action: 'update', message: `Updated expense ${e.description}` });
    return e;
  }

  /**
   * Maker-checker: whoever logged an expense (Finance or Planner included) never decides it. Only PENDING expenses can be decided; a decided
   * expense is corrected with void() (reversal entry), not re-decided.
   */
  async decide(id: string, dto: DecideExpenseDto, actor: AuthUser) {
    if (dto.status === 'PENDING') throw new BadRequestException('Decision must be APPROVED or REJECTED');
    const cur = await this.prisma.expense.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Expense not found');
    if (cur.reversalOfId) throw new UnprocessableEntityException('A reversal entry cannot be decided');
    assertDifferentPerson(actor.id, await creatorOf(this.prisma, 'Expense', id), 'you logged this expense, so someone else must approve or reject it');
    const c = await this.prisma.expense.updateMany({ where: { id, status: 'PENDING' }, data: { status: dto.status } });
    if (!c.count) throw new ConflictException(`This expense is already ${cur.status.toLowerCase()}`);
    const e = await this.prisma.expense.findUniqueOrThrow({ where: { id }, include });
    await this.approvals.syncDecision('Expense', id, dto.status as 'APPROVED' | 'REJECTED', actor.id).catch(() => undefined);
    await this.audit.log({ actorId: actor.id, weddingId: e.weddingId, entity: 'Expense', entityId: id, action: dto.status.toLowerCase(), message: `${dto.status === 'APPROVED' ? 'Approved' : 'Rejected'} expense ${inr(e.amount)} — ${e.description}`, meta: { loggedBy: await creatorOf(this.prisma, 'Expense', id) } });
    return e;
  }

  /** Expenses are never deleted. A pending one is rejected; an approved one gets a reversal entry (the original keeps its history and is excluded from totals). */
  async void(id: string, reason: string, actor: AuthUser) {
    const cur = await this.prisma.expense.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Expense not found');
    if (cur.reversalOfId) throw new UnprocessableEntityException('A reversal entry cannot be voided');
    if (cur.reversedAt) throw new ConflictException('This expense was already reversed');
    if (cur.status === 'REJECTED') return this.prisma.expense.findUniqueOrThrow({ where: { id }, include });
    if (cur.status === 'PENDING') {
      await this.prisma.expense.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      await this.approvals.syncDecision('Expense', id, 'REJECTED', actor.id).catch(() => undefined);
      await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'Expense', entityId: id, action: 'void', message: `Voided pending expense ${inr(cur.amount)} — ${reason}`, meta: { reason } });
      return this.prisma.expense.findUniqueOrThrow({ where: { id }, include });
    }
    const out = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.expense.updateMany({ where: { id, reversedAt: null }, data: { reversedAt: new Date() } });
      if (!claim.count) throw new ConflictException('This expense was already reversed');
      await tx.expense.create({ data: { weddingId: cur.weddingId, vendorId: cur.vendorId, category: cur.category, description: `Reversal: ${cur.description}`, amount: cur.amount, date: new Date(), method: cur.method, status: 'APPROVED', responsibleId: actor.id, isTeamCost: cur.isTeamCost, reversalOfId: id } });
      await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'Expense', entityId: id, action: 'reverse', message: `Reversed expense ${inr(cur.amount)} — ${reason}`, meta: { reason } }, tx);
      return tx.expense.findUniqueOrThrow({ where: { id }, include });
    });
    return out;
  }

  async setBudget(weddingId: string, dto: SetBudgetDto, actor: AuthUser) {
    await this.prisma.$transaction(dto.lines.map((l) => this.prisma.budgetLine.upsert({ where: { weddingId_category: { weddingId, category: l.category } }, create: { weddingId, category: l.category, plannedAmount: l.plannedAmount }, update: { plannedAmount: l.plannedAmount } })));
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'BudgetLine', action: 'set', message: `Updated planned budget (${dto.lines.length} lines)` });
    return this.summary(weddingId);
  }

  /** Planned vs actual by category. Actual = approved expenses + vendor bills whose category label matches. */
  async summary(weddingId: string) {
    const [lines, expenses, wvs] = await Promise.all([
      this.prisma.budgetLine.findMany({ where: { weddingId } }),
      this.prisma.expense.groupBy({ by: ['category'], where: { weddingId, status: 'APPROVED', reversalOfId: null, reversedAt: null }, _sum: { amount: true } }),
      this.prisma.weddingVendor.findMany({ where: { weddingId }, select: { id: true, category: true } }),
    ]);
    const actual = new Map<string, Prisma.Decimal>();
    const norm = (s: string) => s.trim().toLowerCase();
    const add = (cat: string, v: Prisma.Decimal.Value) => actual.set(norm(cat), (actual.get(norm(cat)) ?? D(0)).plus(D(v)));
    expenses.forEach((e) => add(e.category, e._sum.amount ?? 0));
    for (const w of wvs) add(w.category.replace('_', ' '), (await vendorBill(this.prisma, w.id)).finalBill);
    const cats = new Set([...lines.map((l) => norm(l.category)), ...actual.keys()]);
    const rows = [...cats].map((c) => {
      const planned = D(lines.find((l) => norm(l.category) === c)?.plannedAmount);
      const act = actual.get(c) ?? D(0);
      return { category: lines.find((l) => norm(l.category) === c)?.category ?? c.replace(/\b\w/g, (m) => m.toUpperCase()), planned: money(planned), actual: money(act), variance: money(act.minus(planned)), overBudget: act.gt(planned) && planned.gt(0) };
    }).sort(byDesc((r) => r.actual));
    return { rows, totals: { planned: money(sum(rows.map((r) => r.planned))), actual: money(sum(rows.map((r) => r.actual))) } };
  }
}
