import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PaymentMethod, Prisma, VendorPaymentKind, VendorPaymentStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { above, assertDifferentPerson, assertIndependent, financeLimits } from '../../common/finance-policy';
import { D, money, sum, vendorPaid } from '../../common/finance';
import { Paginated, skipTake } from '../../common/pagination';
import { inr } from '../../common/pdf-templates';
import { ScopeService } from '../../common/scope.service';
import { vendorBill } from '../../common/vendor-bill';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { billOutstanding } from '../vendor-bills/bill-math';
import { CreateVendorPaymentDto, ExecuteVendorPaymentDto, VendorPaymentQuery } from './vendor-payments.dto';

/** Statuses that hold money back from the bill / vendor balance (so two requests cannot both spend the same outstanding). */
export const RESERVING: VendorPaymentStatus[] = ['REQUESTED', 'APPROVED', 'SCHEDULED', 'PROCESSING'];
const lc = (s: string) => s.toLowerCase().replace(/_/g, ' ');

const include = {
  weddingVendor: { select: { id: true, category: true, vendor: { select: { id: true, name: true } } } },
  wedding: { select: { id: true, name: true } },
  bill: { select: { id: true, billNo: true, total: true, amountPaid: true, status: true, approvedById: true, verifiedById: true, submittedById: true } },
} satisfies Prisma.VendorPaymentInclude;
type Row = Prisma.VendorPaymentGetPayload<{ include: typeof include }>;

export interface DirectPaymentInput { weddingId: string; weddingVendorId: string; billId?: string | null; kind: VendorPaymentKind; amount: Prisma.Decimal.Value; method: PaymentMethod; reference?: string | null; paidAt?: Date | null; idempotencyKey: string; notes?: string }

/**
 * Vendor Payments: the settlement side of vendor money (a bill is the obligation, a payment is the settlement).
 * REQUESTED -> APPROVED -> (SCHEDULED) -> PROCESSING -> PAID, with FAILED (retryable) and CANCELLED. Maker-checker: the approver is never the
 * requester and never the executor; above the Founder threshold (Business Settings "approval limits") only the Founder approves.
 */
@Injectable()
export class VendorPaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private approvals: ApprovalsService, private notif: NotificationsService, private scope: ScopeService) {}

  private async people(ids: (string | null | undefined)[]) {
    const u = await this.prisma.user.findMany({ where: { id: { in: ids.filter(Boolean) as string[] } }, select: { id: true, name: true, role: true } });
    return new Map(u.map((x) => [x.id, x]));
  }

  private async shape(rows: Row[]) {
    const ppl = await this.people(rows.flatMap((r) => [r.requestedById, r.approvedById]));
    return rows.map((r) => ({ ...r, requestedBy: r.requestedById ? ppl.get(r.requestedById) ?? null : null, approvedBy: r.approvedById ? ppl.get(r.approvedById) ?? null : null, isReversal: !!r.reversalOfId }));
  }

  private tabWhere(tab?: string): Prisma.VendorPaymentWhereInput {
    switch (tab) {
      case 'requests': return { status: { in: ['REQUESTED', 'APPROVED'] } };
      case 'approvals': return { status: 'REQUESTED' };
      case 'advances': return { kind: 'ADVANCE', reversalOfId: null };
      case 'settlements': return { kind: 'FINAL', reversalOfId: null };
      case 'scheduled': return { status: { in: ['SCHEDULED', 'PROCESSING'] } };
      case 'failed': return { status: 'FAILED' };
      case 'history': return { status: { in: ['PAID', 'FAILED', 'CANCELLED'] } };
      default: return {};
    }
  }

  async list(q: VendorPaymentQuery, actor: AuthUser) {
    const where: Prisma.VendorPaymentWhereInput = {
      ...this.tabWhere(q.tab), ...(q.status ? { status: q.status } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.billId ? { billId: q.billId } : {}), ...(q.vendorId ? { weddingVendor: { vendorId: q.vendorId } } : {}),
      ...(actor.role === 'PLANNER' ? { requestedById: actor.id } : {}), // Planner only sees what they proposed
      ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { weddingVendor: { vendor: { name: { contains: q.search, mode: 'insensitive' } } } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }, { bill: { billNo: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const sortable = ['createdAt', 'amount', 'status', 'paidAt', 'scheduledFor', 'requestedAt'];
    const [rows, total] = await Promise.all([
      this.prisma.vendorPayment.findMany({ where, include, orderBy: { [q.sort && sortable.includes(q.sort) ? q.sort : 'requestedAt']: q.order }, ...skipTake(q) }),
      this.prisma.vendorPayment.count({ where }),
    ]);
    const p = new Paginated(await this.shape(rows), { page: q.page, pageSize: q.pageSize, total });
    (p.meta as Record<string, unknown>).summary = await this.summary(actor);
    return p;
  }

  async summary(actor?: AuthUser) {
    const where: Prisma.VendorPaymentWhereInput = actor?.role === 'PLANNER' ? { requestedById: actor.id } : {};
    const g = await this.prisma.vendorPayment.groupBy({ by: ['status'], where: { ...where, reversalOfId: null }, _count: true, _sum: { amount: true } });
    const of = (s: VendorPaymentStatus) => g.find((x) => x.status === s);
    const amt = (...s: VendorPaymentStatus[]) => money(sum(s.map((x) => of(x)?._sum.amount)));
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const month = await this.prisma.vendorPayment.findMany({ where: { ...where, status: 'PAID', paidAt: { gte: monthStart } }, select: { amount: true, status: true, reversalOfId: true } });
    return {
      counts: Object.fromEntries((['REQUESTED', 'APPROVED', 'SCHEDULED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'] as VendorPaymentStatus[]).map((s) => [s, of(s)?._count ?? 0])),
      amounts: { requested: amt('REQUESTED'), approved: amt('APPROVED'), scheduled: amt('SCHEDULED'), processing: amt('PROCESSING'), paid: amt('PAID'), failed: amt('FAILED') },
      awaitingApproval: amt('REQUESTED'), readyToExecute: amt('APPROVED', 'SCHEDULED'), paidThisMonth: money(vendorPaid(month)),
    };
  }

  private async load(id: string) {
    const p = await this.prisma.vendorPayment.findUnique({ where: { id }, include });
    if (!p) throw new NotFoundException('Vendor payment not found');
    return p;
  }

  async get(id: string, actor?: AuthUser) {
    const p = await this.load(id);
    if (actor?.role === 'PLANNER' && p.requestedById !== actor.id) throw new ForbiddenException('Planners can only see the payments they proposed');
    const [[row], history, approval, billPayments, limits] = await Promise.all([
      this.shape([p]),
      this.history(id),
      p.approvalId ? this.prisma.approval.findUnique({ where: { id: p.approvalId }, select: { id: true, reference: true, status: true, decidedAt: true, decisionNote: true, assignedApproverId: true } }) : null,
      this.prisma.vendorBillPayment.findMany({ where: { vendorPaymentId: id } }),
      financeLimits(this.prisma),
    ]);
    return { ...row, approval, billPayments, history, requiresFounder: above(p.amount, limits.vendorPayment), founderLimit: limits.vendorPayment };
  }

  history(id: string) { return this.prisma.activityLog.findMany({ where: { entity: 'VendorPayment', entityId: id }, orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true, role: true } } } }); }

  /** Vendor portal: only the vendor's own payments that are real (scheduled / processing / paid), nothing about internal approvals. */
  async mine(actor: AuthUser) {
    const vendorId = this.scope.requireVendorId(actor);
    const rows = await this.prisma.vendorPayment.findMany({ where: { weddingVendor: { vendorId }, status: { in: ['SCHEDULED', 'PROCESSING', 'PAID'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, amount: true, kind: true, status: true, method: true, reference: true, paidAt: true, scheduledFor: true, reversalOfId: true, wedding: { select: { id: true, name: true } }, bill: { select: { billNo: true } } } });
    return { items: rows, totalPaid: money(vendorPaid(rows.map((r) => ({ amount: r.amount, status: r.status, reversalOfId: r.reversalOfId })))) };
  }

  // ---------------------------------------------------------------- balances

  /** How much more can be committed against a bill (outstanding minus requests already in flight). */
  private async billRoom(tx: Prisma.TransactionClient, billId: string, excludeId?: string) {
    const b = await tx.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    const reserved = await tx.vendorPayment.aggregate({ where: { billId, status: { in: RESERVING }, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { amount: true } });
    const outstanding = billOutstanding(b.total, b.amountPaid);
    return { bill: b, outstanding, room: money(outstanding.minus(D(reserved._sum.amount))), reserved: D(reserved._sum.amount) };
  }

  /** How much more can be committed to a booked vendor outside any bill (contract / final bill cap minus paid minus in-flight). */
  private async vendorRoom(tx: Prisma.TransactionClient, weddingVendorId: string, excludeId?: string) {
    const bill = await vendorBill(tx, weddingVendorId);
    const cap = D(bill.finalBill).gt(bill.negotiated) ? D(bill.finalBill) : D(bill.negotiated);
    const reserved = await tx.vendorPayment.aggregate({ where: { weddingVendorId, status: { in: RESERVING }, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { amount: true } });
    return { bill, cap, room: money(cap.minus(D(bill.paid)).minus(D(reserved._sum.amount))) };
  }

  private async assertRoom(tx: Prisma.TransactionClient, p: { billId?: string | null; weddingVendorId: string; amount: Prisma.Decimal.Value; excludeId?: string }) {
    if (p.billId) {
      const r = await this.billRoom(tx, p.billId, p.excludeId);
      if (D(p.amount).gt(r.room)) throw new UnprocessableEntityException(`Amount exceeds the outstanding balance of ${inr(r.room)} on ${r.bill.billNo}${r.reserved.gt(0) ? ` (after ${inr(r.reserved)} already requested)` : ''}`);
      return r;
    }
    const r = await this.vendorRoom(tx, p.weddingVendorId, p.excludeId);
    if (D(p.amount).gt(r.room)) throw new UnprocessableEntityException(`Payment would exceed the vendor's bill (${inr(r.cap)}; already paid ${inr(r.bill.paid)})`);
    return r;
  }

  /** Posts money against a bill (a VendorBillPayment row + status). The caller holds the bill row lock. */
  async applyBillPayment(tx: Prisma.TransactionClient, billId: string, p: { amount: Prisma.Decimal.Value; method: PaymentMethod; reference?: string | null; paidAt: Date; idempotencyKey: string; vendorPaymentId?: string | null; actorId?: string | null }) {
    const b = await tx.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    await tx.vendorBillPayment.create({ data: { billId, amount: money(D(p.amount)), method: p.method, reference: p.reference ?? undefined, paidAt: p.paidAt, idempotencyKey: p.idempotencyKey, vendorPaymentId: p.vendorPaymentId ?? undefined, recordedById: p.actorId ?? undefined } });
    const paid = money(D(b.amountPaid).plus(D(p.amount)));
    const full = paid.gte(D(b.total));
    await tx.vendorBill.update({ where: { id: billId }, data: { amountPaid: paid, status: full ? 'PAID' : 'PARTIALLY_PAID', ...(full ? { paidAt: p.paidAt } : {}) } });
    return { paid, settled: full };
  }

  // ---------------------------------------------------------------- target resolution

  private async resolveTarget(dto: { billId?: string; purchaseOrderId?: string; weddingVendorId?: string }) {
    if (!dto.billId && !dto.purchaseOrderId && !dto.weddingVendorId) throw new BadRequestException('Point the request at a bill (billId), a purchase order (purchaseOrderId) or a booked vendor (weddingVendorId)');
    if (dto.billId) {
      const b = await this.prisma.vendorBill.findUnique({ where: { id: dto.billId }, include: { vendor: { select: { name: true } } } });
      if (!b) throw new NotFoundException('Vendor bill not found');
      if (!['VERIFIED', 'APPROVED', 'PARTIALLY_PAID'].includes(b.status)) throw new UnprocessableEntityException(`Payments can only be requested against a verified or approved bill (this one is ${lc(b.status)})`);
      if (!b.weddingId) throw new UnprocessableEntityException('This bill is not linked to a wedding, so it cannot be paid through a vendor payment (link it to a wedding first)');
      const wv = await this.prisma.weddingVendor.findFirst({ where: { weddingId: b.weddingId, vendorId: b.vendorId }, select: { id: true } });
      if (!wv) throw new UnprocessableEntityException(`${b.vendor.name} is not booked on this wedding`);
      if (dto.weddingVendorId && dto.weddingVendorId !== wv.id) throw new BadRequestException('weddingVendorId does not match the bill');
      return { weddingId: b.weddingId, weddingVendorId: wv.id, billId: b.id as string | null, label: `bill ${b.billNo}`, vendorName: b.vendor.name };
    }
    if (dto.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId }, include: { vendor: { select: { name: true } } } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status === 'CANCELLED' || po.status === 'DRAFT') throw new UnprocessableEntityException(`An advance cannot be requested on a ${lc(po.status)} purchase order`);
      const wv = await this.prisma.weddingVendor.findFirst({ where: { weddingId: po.weddingId, vendorId: po.vendorId }, select: { id: true } });
      if (!wv) throw new UnprocessableEntityException(`${po.vendor.name} is not booked on this wedding`);
      return { weddingId: po.weddingId, weddingVendorId: wv.id, billId: null as string | null, label: `PO ${po.poNumber}`, vendorName: po.vendor.name };
    }
    const wv = await this.prisma.weddingVendor.findUnique({ where: { id: dto.weddingVendorId! }, include: { vendor: { select: { name: true } } } });
    if (!wv) throw new NotFoundException('Vendor is not assigned to a wedding');
    return { weddingId: wv.weddingId, weddingVendorId: wv.id, billId: null as string | null, label: `${wv.vendor.name} (${lc(wv.category)})`, vendorName: wv.vendor.name };
  }

  // ---------------------------------------------------------------- workflow

  /** Raises a REQUESTED payment (and its Approval record). Idempotent on the key; capped at what is still outstanding. */
  async createRequest(dto: CreateVendorPaymentDto, actor: AuthUser) {
    const dup = await this.prisma.vendorPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include });
    if (dup) return { payment: (await this.shape([dup]))[0], duplicate: true };
    const t = await this.resolveTarget(dto);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Serialise on the same row that holds the balance, so concurrent requests cannot both fit.
        if (t.billId) await tx.$queryRaw`SELECT id FROM "VendorBill" WHERE id = ${t.billId} FOR UPDATE`;
        else await tx.$queryRaw`SELECT id FROM "WeddingVendor" WHERE id = ${t.weddingVendorId} FOR UPDATE`;
        const again = await tx.vendorPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (again) return { row: again, dup: true as const };
        const room = await this.assertRoom(tx, { billId: t.billId, weddingVendorId: t.weddingVendorId, amount: dto.amount });
        const kind = dto.kind ?? (D(dto.amount).gte(room.room) ? 'FINAL' : 'ADVANCE');
        const p = await tx.vendorPayment.create({
          data: { weddingId: t.weddingId, weddingVendorId: t.weddingVendorId, billId: t.billId, kind, amount: money(D(dto.amount)), method: dto.method, reference: dto.reference, status: 'REQUESTED', idempotencyKey: dto.idempotencyKey, recordedById: actor.id, requestedById: actor.id, scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined, notes: dto.notes },
        });
        const ap = await this.approvals.requestFor({ type: 'VENDOR_PAYMENT', title: `Pay ${t.vendorName} — ${inr(dto.amount)} (${t.label})`, description: dto.notes, reason: dto.reason ?? dto.notes ?? `${kind.toLowerCase()} payment for ${t.label}`, amount: dto.amount, weddingId: t.weddingId, entity: 'VendorPayment', entityId: p.id, sourceModule: 'vendor-payments', sourceId: p.id }, actor, tx);
        const linked = await tx.vendorPayment.update({ where: { id: p.id }, data: { approvalId: ap.id } });
        await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'VendorPayment', entityId: p.id, action: 'request', message: `Requested ${kind.toLowerCase()} payment ${inr(dto.amount)} to ${t.vendorName} for ${t.label}${actor.role === 'PLANNER' ? ' (proposed by Planner)' : ''}`, meta: { billId: t.billId, kind, approvalId: ap.id, approvalReference: ap.reference, proposedByRole: actor.role } }, tx);
        return { row: linked, dup: false as const };
      }, { timeout: 20000 });
      const full = await this.load(created.row.id);
      return { payment: (await this.shape([full]))[0], duplicate: created.dup };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.vendorPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include });
        if (again) return { payment: (await this.shape([again]))[0], duplicate: true };
      }
      throw e;
    }
  }

  /** Approve. Never the requester; above the Founder limit only the Founder. */
  async approve(id: string, note: string | undefined, actor: AuthUser) {
    const p = await this.load(id);
    if (p.status !== 'REQUESTED') throw new ConflictException(`Only requested payments can be approved (this one is ${lc(p.status)})`);
    assertDifferentPerson(actor.id, p.requestedById, 'you requested this payment, so someone else must approve it');
    const limits = await financeLimits(this.prisma);
    if (above(p.amount, limits.vendorPayment) && actor.role !== 'FOUNDER') throw new ForbiddenException(`Payments above ${inr(limits.vendorPayment)} need Founder approval`);
    if (p.approvalId) await this.approvals.decide(p.approvalId, 'APPROVED', note, actor);
    else {
      const c = await this.prisma.vendorPayment.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() } });
      if (!c.count) throw new ConflictException('This payment was just changed by someone else — refresh');
    }
    await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'approve', message: `Approved vendor payment ${inr(p.amount)}${note ? ` — ${note}` : ''}`, meta: { requestedById: p.requestedById, approvalId: p.approvalId } });
    this.notif.notify({ type: 'vendor-payment.approved', title: 'Vendor payment approved', body: `${inr(p.amount)} — ready to execute`, link: '/vendor-payments', roles: ['FINANCE'] }).catch(() => undefined);
    return this.get(id, actor);
  }

  async reject(id: string, note: string, actor: AuthUser) {
    const p = await this.load(id);
    if (p.status !== 'REQUESTED') throw new ConflictException(`Only requested payments can be rejected (this one is ${lc(p.status)})`);
    assertDifferentPerson(actor.id, p.requestedById, 'you requested this payment, so someone else must reject it (or cancel it yourself)');
    const limits = await financeLimits(this.prisma);
    if (above(p.amount, limits.vendorPayment) && actor.role !== 'FOUNDER') throw new ForbiddenException(`Payments above ${inr(limits.vendorPayment)} are decided by the Founder`);
    if (p.approvalId) await this.approvals.decide(p.approvalId, 'REJECTED', note, actor);
    else await this.prisma.vendorPayment.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'CANCELLED', failureReason: `Rejected: ${note}` } });
    await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'reject', message: `Rejected vendor payment ${inr(p.amount)} — ${note}` });
    return this.get(id, actor);
  }

  async schedule(id: string, scheduledFor: string, actor: AuthUser) {
    const when = new Date(scheduledFor);
    const c = await this.prisma.vendorPayment.updateMany({ where: { id, status: { in: ['APPROVED', 'SCHEDULED'] } }, data: { status: 'SCHEDULED', scheduledFor: when } });
    if (!c.count) { const p = await this.load(id); throw new ConflictException(`Only approved payments can be scheduled (this one is ${lc(p.status)})`); }
    const p = await this.load(id);
    await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'schedule', message: `Scheduled vendor payment ${inr(p.amount)} for ${when.toISOString().slice(0, 10)}`, meta: { scheduledFor: when.toISOString() } });
    return this.get(id, actor);
  }

  /** Marks the bank transfer as started (PROCESSING). Execute completes it. */
  async process(id: string, actor: AuthUser) {
    const p = await this.load(id);
    this.assertCanExecute(p, actor);
    const c = await this.prisma.vendorPayment.updateMany({ where: { id, status: { in: ['APPROVED', 'SCHEDULED'] } }, data: { status: 'PROCESSING' } });
    if (!c.count) throw new ConflictException(`Only approved or scheduled payments can start processing (this one is ${lc(p.status)})`);
    await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'process', message: `Started processing vendor payment ${inr(p.amount)}` });
    return this.get(id, actor);
  }

  private assertCanExecute(p: Row, actor: AuthUser) {
    if (!p.approvedById && !p.approvalId) throw new ConflictException('This payment has no approval on record, so it cannot be executed');
    assertDifferentPerson(actor.id, p.approvedById, 'you approved this payment, so someone else must execute it');
  }

  /** APPROVED / SCHEDULED / PROCESSING -> PROCESSING -> PAID (paidAt set). Posts to the bill. Executor is never the approver. */
  async execute(id: string, dto: ExecuteVendorPaymentDto, actor: AuthUser) {
    const pre = await this.load(id);
    if (pre.status === 'REQUESTED') throw new ConflictException('This payment has not been approved yet');
    this.assertCanExecute(pre, actor);
    const limits = await financeLimits(this.prisma);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "VendorPayment" WHERE id = ${id} FOR UPDATE`;
      const p = await tx.vendorPayment.findUniqueOrThrow({ where: { id } });
      if (!['APPROVED', 'SCHEDULED', 'PROCESSING'].includes(p.status)) throw new ConflictException(`Only approved payments can be executed (this one is ${lc(p.status)})`);
      if (p.approvedById && p.approvedById === actor.id) throw new ForbiddenException('Maker-checker: you approved this payment, so someone else must execute it');
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      if (p.billId) {
        await tx.$queryRaw`SELECT id FROM "VendorBill" WHERE id = ${p.billId} FOR UPDATE`;
        const b = await tx.vendorBill.findUniqueOrThrow({ where: { id: p.billId } });
        if (!['APPROVED', 'PARTIALLY_PAID'].includes(b.status)) throw new UnprocessableEntityException(`The bill ${b.billNo} must be approved before it can be paid (it is ${lc(b.status)})`);
        if (D(b.total).gt(limits.vendorPayment)) assertIndependent(actor.id, [{ label: 'approved the bill for', userId: b.approvedById }], 'pay');
        const due = billOutstanding(b.total, b.amountPaid);
        if (D(p.amount).gt(due)) throw new UnprocessableEntityException(`Amount exceeds the outstanding balance of ${inr(due)} on ${b.billNo}`);
      } else {
        await tx.$queryRaw`SELECT id FROM "WeddingVendor" WHERE id = ${p.weddingVendorId} FOR UPDATE`;
        await this.assertRoom(tx, { billId: null, weddingVendorId: p.weddingVendorId, amount: p.amount, excludeId: id });
      }
      await tx.vendorPayment.update({ where: { id }, data: { status: 'PROCESSING' } });
      await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'process', message: `Processing vendor payment ${inr(p.amount)}` }, tx);
      await tx.vendorPayment.update({ where: { id }, data: { status: 'PAID', paidAt, recordedById: actor.id, failureReason: null, ...(dto.reference ? { reference: dto.reference } : {}), ...(dto.method ? { method: dto.method } : {}) } });
      if (p.billId) await this.applyBillPayment(tx, p.billId, { amount: p.amount, method: dto.method ?? p.method, reference: dto.reference ?? p.reference, paidAt, idempotencyKey: `vp:${id}`, vendorPaymentId: id, actorId: actor.id });
      await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'execute', message: `Paid vendor ${inr(p.amount)}${dto.reference ? ` (ref ${dto.reference})` : ''}`, meta: { billId: p.billId, approvedById: p.approvedById, requestedById: p.requestedById, reference: dto.reference ?? p.reference ?? null } }, tx);
    }, { timeout: 20000 });
    return this.get(id, actor);
  }

  async fail(id: string, reason: string, actor: AuthUser) {
    const p = await this.load(id);
    const c = await this.prisma.vendorPayment.updateMany({ where: { id, status: { in: ['APPROVED', 'SCHEDULED', 'PROCESSING'] } }, data: { status: 'FAILED', failureReason: reason } });
    if (!c.count) throw new ConflictException(`Only approved, scheduled or processing payments can fail (this one is ${lc(p.status)})`);
    await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'fail', message: `Vendor payment ${inr(p.amount)} failed — ${reason}`, meta: { reason } });
    this.notif.notify({ type: 'vendor-payment.failed', title: 'Vendor payment failed', body: `${inr(p.amount)} — ${reason}`, link: '/vendor-payments', roles: ['FINANCE'] }).catch(() => undefined);
    return this.get(id, actor);
  }

  /** FAILED -> APPROVED again (the original approval stands; still needs an executor other than the approver). */
  async retry(id: string, actor: AuthUser) {
    const p = await this.load(id);
    const c = await this.prisma.vendorPayment.updateMany({ where: { id, status: 'FAILED', OR: [{ approvedById: { not: null } }, { approvalId: { not: null } }] }, data: { status: 'APPROVED', failureReason: null } });
    if (!c.count) throw new ConflictException(`Only failed, previously approved payments can be retried (this one is ${lc(p.status)})`);
    await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'retry', message: `Retrying vendor payment ${inr(p.amount)}` });
    return this.get(id, actor);
  }

  async cancel(id: string, reason: string, actor: AuthUser) {
    const p = await this.load(id);
    if (actor.role === 'PLANNER' && p.requestedById !== actor.id) throw new ForbiddenException('Planners can only cancel their own proposals');
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.vendorPayment.updateMany({ where: { id, status: { in: ['REQUESTED', 'APPROVED', 'SCHEDULED', 'FAILED'] } }, data: { status: 'CANCELLED', failureReason: reason } });
      if (!c.count) throw new ConflictException(`This payment is ${lc(p.status)} and can no longer be cancelled (reverse it instead)`);
      if (p.approvalId) await tx.approval.updateMany({ where: { id: p.approvalId, status: { in: ['PENDING', 'IN_REVIEW'] } }, data: { status: 'CANCELLED', decidedById: actor.id, decidedAt: new Date(), decisionNote: 'Payment cancelled' } });
      await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'cancel', message: `Cancelled vendor payment ${inr(p.amount)} — ${reason}`, meta: { reason } }, tx);
    });
    return this.get(id, actor);
  }

  /** Takes a PAID payment back out with a reversal row (history stays). Founder only (route). */
  async reverse(id: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "VendorPayment" WHERE id = ${id} FOR UPDATE`;
      const p = await tx.vendorPayment.findUnique({ where: { id } });
      if (!p) throw new NotFoundException('Vendor payment not found');
      if (p.status !== 'PAID' || p.reversalOfId) throw new ConflictException('Only an executed payment can be reversed');
      if (p.reversedAt) throw new ConflictException('This payment was already reversed');
      const now = new Date();
      const rev = await tx.vendorPayment.create({ data: { weddingId: p.weddingId, weddingVendorId: p.weddingVendorId, billId: p.billId, kind: p.kind, amount: p.amount, method: p.method, reference: `Reversal of ${p.reference ?? p.id.slice(0, 8)}`, paidAt: now, status: 'PAID', idempotencyKey: `rev:${p.id}`, recordedById: actor.id, requestedById: actor.id, reversalOfId: p.id, notes: reason } });
      await tx.vendorPayment.update({ where: { id }, data: { reversedAt: now } });
      if (p.billId) {
        await tx.$queryRaw`SELECT id FROM "VendorBill" WHERE id = ${p.billId} FOR UPDATE`;
        const b = await tx.vendorBill.findUniqueOrThrow({ where: { id: p.billId } });
        const orig = await tx.vendorBillPayment.findFirst({ where: { vendorPaymentId: p.id, reversalOfId: null } });
        await tx.vendorBillPayment.create({ data: { billId: p.billId, amount: p.amount, method: p.method, reference: 'Reversal', paidAt: now, idempotencyKey: `vp-rev:${p.id}`, vendorPaymentId: rev.id, recordedById: actor.id, reversalOfId: orig?.id } });
        if (orig) await tx.vendorBillPayment.update({ where: { id: orig.id }, data: { reversedAt: now } });
        const left = D(b.amountPaid).minus(D(p.amount));
        const paid = money(left.lt(0) ? D(0) : left);
        await tx.vendorBill.update({ where: { id: p.billId }, data: { amountPaid: paid, paidAt: null, status: paid.gte(D(b.total)) ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : b.approvedById ? 'APPROVED' : b.verifiedById ? 'VERIFIED' : 'SUBMITTED' } });
      }
      await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: id, action: 'reverse', message: `Reversed vendor payment ${inr(p.amount)} — ${reason}`, meta: { reversalId: rev.id, reason } }, tx);
    }, { timeout: 20000 });
    return this.get(id, actor);
  }

  // ---------------------------------------------------------------- direct (legacy) path

  /**
   * Legacy "record a payment" routes (POST /weddings/:id/vendor-payments, POST /vendor-bills/:id/pay, reconciliation settle) delegate here.
   * It is the whole workflow in one step and is only allowed when the amount is at or below the Finance threshold (auto-approved by policy,
   * audited as such) or when the Founder does it. Above the threshold: raise a request (POST /vendor-payments).
   */
  async assertDirectAllowed(actor: AuthUser, amount: Prisma.Decimal.Value) {
    if (actor.role === 'FOUNDER') return { mode: 'founder' as const, limit: Infinity };
    if (actor.role !== 'FINANCE') throw new ForbiddenException('Your role does not allow paying vendors');
    const limits = await financeLimits(this.prisma);
    if (above(amount, limits.vendorPayment)) throw new ForbiddenException(`Payments above ${inr(limits.vendorPayment)} need an approved request: create one at POST /vendor-payments and have the Founder approve it`);
    return { mode: 'auto-approved' as const, limit: limits.vendorPayment };
  }

  /** The caller must hold the row locks and run this inside its transaction. */
  async postDirect(tx: Prisma.TransactionClient, p: DirectPaymentInput, actor: AuthUser) {
    const dup = await tx.vendorPayment.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
    if (dup) return { payment: dup, duplicate: true };
    await this.assertRoom(tx, { billId: p.billId, weddingVendorId: p.weddingVendorId, amount: p.amount });
    const gate = await this.assertDirectAllowed(actor, p.amount);
    const paidAt = p.paidAt ?? new Date();
    const payment = await tx.vendorPayment.create({
      data: { weddingId: p.weddingId, weddingVendorId: p.weddingVendorId, billId: p.billId ?? undefined, kind: p.kind, amount: money(D(p.amount)), method: p.method, reference: p.reference ?? undefined, paidAt, status: 'PAID', idempotencyKey: p.idempotencyKey, recordedById: actor.id, requestedById: actor.id, approvedById: gate.mode === 'founder' ? actor.id : undefined, approvedAt: new Date(), notes: p.notes ?? (gate.mode === 'founder' ? 'Paid directly by the Founder' : `Direct payment, auto-approved (at or under ${inr(gate.limit)})`) },
    });
    await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'VendorPayment', entityId: payment.id, action: 'record', message: `Paid vendor ${inr(p.amount)} (${p.kind.toLowerCase()})${p.reference ? ` — ${p.reference}` : ''}`, meta: { reference: p.reference ?? null, billId: p.billId ?? null, direct: true, approval: gate.mode } }, tx);
    return { payment, duplicate: false };
  }

  /** Legacy POST /weddings/:id/vendor-payments. */
  async recordDirect(weddingId: string, dto: { weddingVendorId: string; kind: VendorPaymentKind; amount: number; method: PaymentMethod; reference?: string; paidAt?: string; idempotencyKey: string }, actor: AuthUser) {
    const dup = await this.prisma.vendorPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (dup) return { payment: dup, duplicate: true };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const wv = await tx.weddingVendor.findFirst({ where: { id: dto.weddingVendorId, weddingId } });
        if (!wv) throw new NotFoundException('Vendor is not assigned to this wedding');
        await tx.$queryRaw`SELECT id FROM "WeddingVendor" WHERE id = ${wv.id} FOR UPDATE`;
        return this.postDirect(tx, { weddingId, weddingVendorId: wv.id, kind: dto.kind, amount: dto.amount, method: dto.method, reference: dto.reference, paidAt: dto.paidAt ? new Date(dto.paidAt) : null, idempotencyKey: dto.idempotencyKey }, actor);
      }, { timeout: 20000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.vendorPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (again) return { payment: again, duplicate: true };
      }
      throw e;
    }
  }
}
