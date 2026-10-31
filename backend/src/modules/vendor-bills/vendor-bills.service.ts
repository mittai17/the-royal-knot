import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, VendorBillStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, money, sum } from '../../common/finance';
import { Paginated } from '../../common/pagination';
import { inr } from '../../common/pdf-templates';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { billOutstanding, billStatus, matchAgainstPo } from './bill-math';
import { BillQuery, CreateVendorBillDto, PayBillDto } from './vendor-bills.dto';

const include = {
  vendor: { select: { id: true, name: true, category: true, gstin: true, bankDetails: true } },
  wedding: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, poNumber: true, total: true, status: true, quotationId: true } },
} satisfies Prisma.VendorBillInclude;
type Bill = Prisma.VendorBillGetPayload<{ include: typeof include }>;

/** Bills above this need a Founder-approved VENDOR_PAYMENT approval before finance can approve them. */
export const billApprovalLimit = () => Number(process.env.BILL_APPROVAL_LIMIT ?? 100000);

@Injectable()
export class VendorBillsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private payments: PaymentsService, private approvals: ApprovalsService) {}

  shape(b: Bill, now = new Date()) {
    return { ...b, status: billStatus(b, now), storedStatus: b.status, outstanding: billOutstanding(b.total, b.amountPaid) };
  }

  async list(q: BillQuery) {
    const now = new Date();
    const overdueCut = new Date(now.getTime() - 24 * 3600 * 1000 + 1);
    const unpaid: VendorBillStatus[] = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'OVERDUE'];
    const statusWhere: Prisma.VendorBillWhereInput = !q.status ? {} : q.status === 'OVERDUE' ? { status: { in: unpaid }, dueDate: { lt: overdueCut } }
      : unpaid.includes(q.status) ? { status: q.status, OR: [{ dueDate: null }, { dueDate: { gte: overdueCut } }] } : { status: q.status };
    const where: Prisma.VendorBillWhereInput = {
      ...statusWhere, ...(q.vendorId ? { vendorId: q.vendorId } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}),
      ...(q.search ? { AND: [{ OR: [{ billNo: { contains: q.search, mode: 'insensitive' } }, { vendor: { name: { contains: q.search, mode: 'insensitive' } } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] }] } : {}),
    };
    const [rows, total, all] = await Promise.all([
      this.prisma.vendorBill.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.vendorBill.count({ where }),
      this.prisma.vendorBill.findMany({ select: { status: true, total: true, amountPaid: true, dueDate: true } }),
    ]);
    const p = new Paginated(rows.map((r) => this.shape(r, now)), { page: q.page, pageSize: q.pageSize, total });
    (p.meta as Record<string, unknown>).summary = this.summarize(all, now);
    return p;
  }

  summarize(all: { status: VendorBillStatus; total: Prisma.Decimal; amountPaid: Prisma.Decimal; dueDate: Date | null }[], now = new Date()) {
    const live = all.map((a) => ({ ...a, live: billStatus(a, now) }));
    const of = (s: VendorBillStatus) => live.filter((x) => x.live === s);
    const out = (xs: typeof live) => money(sum(xs.map((x) => billOutstanding(x.total, x.amountPaid))));
    const counts = Object.fromEntries((['SUBMITTED', 'VERIFIED', 'APPROVED', 'PAID', 'OVERDUE', 'REJECTED'] as VendorBillStatus[]).map((s) => [s, of(s).length]));
    return { counts, payable: out(live.filter((x) => !['PAID', 'REJECTED'].includes(x.live))), overdue: out(of('OVERDUE')), awaitingApproval: out([...of('SUBMITTED'), ...of('VERIFIED')]), paid: money(sum(live.map((x) => x.amountPaid))) };
  }

  async get(id: string) {
    const b = await this.prisma.vendorBill.findUnique({ where: { id }, include });
    if (!b) throw new NotFoundException('Vendor bill not found');
    return this.detail(b);
  }

  async detail(b: Bill) {
    const [po, quotation, payments, approval, people] = await Promise.all([
      b.purchaseOrderId ? this.prisma.vendorBill.aggregate({ where: { purchaseOrderId: b.purchaseOrderId, id: { not: b.id }, status: { not: 'REJECTED' } }, _sum: { total: true } }) : null,
      b.purchaseOrder?.quotationId ? this.prisma.quotation.findUnique({ where: { id: b.purchaseOrder.quotationId }, select: { id: true, grandTotal: true, status: true } }) : null,
      this.prisma.activityLog.findMany({ where: { entity: 'VendorBill', entityId: b.id, action: { in: ['pay'] } }, orderBy: { createdAt: 'desc' }, include: { actor: { select: { name: true } } } }),
      this.approvals.latestFor('VendorBill', b.id, 'VENDOR_PAYMENT'),
      this.prisma.user.findMany({ where: { id: { in: [b.submittedById, b.verifiedById, b.approvedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    ]);
    const name = (id?: string | null) => people.find((p) => p.id === id)?.name ?? null;
    const match = matchAgainstPo(b.total, b.purchaseOrder ? { total: b.purchaseOrder.total, billed: po?._sum.total ?? 0 } : null);
    return {
      ...this.shape(b), match: { ...match, quotationTotal: quotation?.grandTotal ?? null },
      payments: payments.map((p) => ({ id: p.id, at: p.createdAt, by: p.actor?.name ?? null, amount: (p.meta as { amount?: string } | null)?.amount ?? null, method: (p.meta as { method?: string } | null)?.method ?? null, reference: (p.meta as { reference?: string } | null)?.reference ?? null })),
      approval: approval ? { id: approval.id, status: approval.status } : null, requiresApproval: D(b.total).gt(billApprovalLimit()), approvalLimit: billApprovalLimit(),
      submittedBy: name(b.submittedById), verifiedBy: name(b.verifiedById), approvedBy: name(b.approvedById),
    };
  }

  /** Shared validation for staff-entered and vendor-uploaded bills. */
  async createBill(p: { vendorId: string; billNo: string; weddingId?: string; purchaseOrderId?: string; billDate?: string; dueDate?: string; subtotal: number; taxTotal?: number; notes?: string; documentId?: string | null }, actor: AuthUser, source: 'staff' | 'vendor') {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: p.vendorId }, select: { id: true, name: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (p.weddingId && !(await this.prisma.wedding.count({ where: { id: p.weddingId } }))) throw new NotFoundException('Wedding not found');
    if (p.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findUnique({ where: { id: p.purchaseOrderId }, select: { vendorId: true, weddingId: true, status: true } });
      if (!po || po.vendorId !== p.vendorId) throw new BadRequestException('Purchase order does not belong to this vendor');
      if (po.status === 'CANCELLED') throw new UnprocessableEntityException('That purchase order is cancelled');
      p.weddingId ??= po.weddingId;
    }
    const total = money(D(p.subtotal).plus(D(p.taxTotal)));
    if (total.lte(0)) throw new UnprocessableEntityException('Bill total must be greater than zero');
    const billDate = p.billDate ? new Date(p.billDate) : new Date();
    const dueDate = p.dueDate ? new Date(p.dueDate) : new Date(billDate.getTime() + 30 * 864e5);
    try {
      const b = await this.prisma.vendorBill.create({
        data: { billNo: p.billNo.trim(), vendorId: p.vendorId, weddingId: p.weddingId, purchaseOrderId: p.purchaseOrderId, billDate, dueDate, subtotal: money(D(p.subtotal)), taxTotal: money(D(p.taxTotal)), total, notes: p.notes, documentId: p.documentId, submittedById: actor.id },
        include,
      });
      await this.audit.log({ actorId: actor.id, weddingId: b.weddingId, entity: 'VendorBill', entityId: b.id, action: 'submit', message: `${source === 'vendor' ? `${vendor.name} submitted` : 'Logged'} bill ${b.billNo} for ${inr(total)}`, meta: { vendorId: p.vendorId, purchaseOrderId: p.purchaseOrderId ?? null } });
      await this.notif.notify({ type: 'vendor-bill.submitted', title: 'Vendor bill submitted', body: `${vendor.name} · ${b.billNo} · ${inr(total)}`, link: '/vendor-bills', roles: ['FINANCE'] }).catch(() => undefined);
      return b;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Bill ${p.billNo} already exists for this vendor`);
      throw e;
    }
  }

  async create(dto: CreateVendorBillDto, actor: AuthUser) { return this.shape(await this.createBill(dto, actor, 'staff')); }

  private async transition(id: string, from: VendorBillStatus[], data: Prisma.VendorBillUpdateManyMutationInput & { verifiedById?: string; approvedById?: string }, actor: AuthUser, action: string, msg: (b: Bill) => string) {
    const b = await this.prisma.vendorBill.findUnique({ where: { id }, include });
    if (!b) throw new NotFoundException('Vendor bill not found');
    if (!from.includes(b.status)) throw new UnprocessableEntityException(`A bill that is ${b.status.toLowerCase()} cannot be ${({ verify: 'verified', approve: 'approved', reject: 'rejected' } as Record<string, string>)[action] ?? action}`);
    const claim = await this.prisma.vendorBill.updateMany({ where: { id, status: b.status }, data });
    if (!claim.count) throw new ConflictException('This bill was just changed by someone else — refresh and retry');
    await this.audit.log({ actorId: actor.id, weddingId: b.weddingId, entity: 'VendorBill', entityId: id, action, message: msg(b) });
    return b;
  }

  async verify(id: string, note: string | undefined, actor: AuthUser) {
    const b = await this.transition(id, ['SUBMITTED'], { verifiedById: actor.id, status: 'VERIFIED' }, actor, 'verify', (x) => `Verified bill ${x.billNo} from ${x.vendor.name}${note ? ` — ${note}` : ''}`);
    return this.get(b.id);
  }

  async approve(id: string, note: string | undefined, actor: AuthUser) {
    const b = await this.prisma.vendorBill.findUnique({ where: { id }, include });
    if (!b) throw new NotFoundException('Vendor bill not found');
    if (b.status !== 'VERIFIED') throw new UnprocessableEntityException(`Only verified bills can be approved (this one is ${b.status.toLowerCase()})`);
    if (D(b.total).gt(billApprovalLimit()) && actor.role !== 'ADMIN') {
      const ap = await this.approvals.latestFor('VendorBill', id, 'VENDOR_PAYMENT');
      if (ap?.status !== 'APPROVED') {
        const req = await this.approvals.requestFor({ type: 'VENDOR_PAYMENT', title: `Pay bill ${b.billNo} — ${b.vendor.name}`, description: `Bill total ${inr(b.total)} exceeds the ${inr(billApprovalLimit())} Finance limit`, amount: b.total, weddingId: b.weddingId, entity: 'VendorBill', entityId: id }, actor);
        return { ...(await this.get(id)), approvalRequired: true, approvalRequest: { id: req.id, status: req.status } };
      }
    }
    await this.transition(id, ['VERIFIED'], { approvedById: actor.id, status: 'APPROVED' }, actor, 'approve', (x) => `Approved bill ${x.billNo} (${inr(x.total)}) for payment${note ? ` — ${note}` : ''}`);
    return this.get(id);
  }

  async reject(id: string, note: string, actor: AuthUser) {
    const prev = await this.prisma.vendorBill.findUnique({ where: { id }, select: { notes: true } });
    await this.transition(id, ['SUBMITTED', 'VERIFIED', 'APPROVED'], { status: 'REJECTED', notes: `${prev?.notes ? `${prev.notes}\n` : ''}Rejected: ${note}` }, actor, 'reject', (x) => `Rejected bill ${x.billNo} — ${note}`);
    return this.get(id);
  }

  /** Part or full payment of an approved bill. Idempotent on `idempotencyKey` (kept in the audit trail); wedding-linked bills also create a VendorPayment. */
  async pay(id: string, dto: PayBillDto, actor: AuthUser) {
    const seen = await this.prisma.activityLog.findFirst({ where: { entity: 'VendorBill', entityId: id, action: 'pay', meta: { path: ['idempotencyKey'], equals: dto.idempotencyKey } } });
    if (seen) return { duplicate: true, bill: await this.get(id) };
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "VendorBill" WHERE id = ${id} FOR UPDATE`;
      const dup = await tx.activityLog.findFirst({ where: { entity: 'VendorBill', entityId: id, action: 'pay', meta: { path: ['idempotencyKey'], equals: dto.idempotencyKey } } });
      if (dup) return;
      const b = await tx.vendorBill.findUnique({ where: { id }, include });
      if (!b) throw new NotFoundException('Vendor bill not found');
      if (b.status !== 'APPROVED') throw new UnprocessableEntityException(`Only approved bills can be paid (this one is ${b.status.toLowerCase()})`);
      const due = billOutstanding(b.total, b.amountPaid);
      if (D(dto.amount).gt(due)) throw new UnprocessableEntityException(`Amount exceeds the outstanding balance of ${inr(due)} on ${b.billNo}`);
      const paid = money(D(b.amountPaid).plus(dto.amount));
      const full = paid.gte(D(b.total));
      let vendorPaymentId: string | null = null;
      if (b.weddingId) {
        const wv = await tx.weddingVendor.findFirst({ where: { weddingId: b.weddingId, vendorId: b.vendorId }, select: { id: true } });
        if (wv) {
          const r = await this.payments.recordVendor(b.weddingId, { weddingVendorId: wv.id, kind: full ? 'FINAL' : 'ADVANCE', amount: dto.amount, method: dto.method, reference: dto.reference ?? b.billNo, paidAt: dto.paidAt, idempotencyKey: `bill:${id}:${dto.idempotencyKey}` }, actor);
          vendorPaymentId = r.payment.id;
        }
      }
      await tx.vendorBill.update({ where: { id }, data: { amountPaid: paid, ...(full ? { status: 'PAID', paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date() } : {}) } });
      await this.audit.log({ actorId: actor.id, weddingId: b.weddingId, entity: 'VendorBill', entityId: id, action: 'pay', message: `Paid ${inr(dto.amount)} on bill ${b.billNo} to ${b.vendor.name}${full ? ' (settled)' : ''}`, meta: { idempotencyKey: dto.idempotencyKey, amount: String(dto.amount), method: dto.method, reference: dto.reference ?? null, vendorPaymentId } }, tx);
    }, { timeout: 20000 });
    return { duplicate: false, bill: await this.get(id) };
  }
}
