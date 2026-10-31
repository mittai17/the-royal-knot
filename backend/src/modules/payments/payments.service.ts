import { Injectable, NotFoundException, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { MilestoneStatus, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { randomBytes } from 'crypto';
import { AuthUser } from '../../common/decorators';
import { D, milestoneStatus, money, sum } from '../../common/finance';
import { Paginated, skipTake } from '../../common/pagination';
import { PdfService } from '../../common/pdf.service';
import { dt, inr, kv, page } from '../../common/pdf-templates';
import { vendorBill } from '../../common/vendor-bill';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import { MilestoneQuery, RecordPaymentDto, RecordVendorPaymentDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private tasks: TasksService, private pdf: PdfService) {}

  /** Live status (never trusts the stored value, which only changes on writes and by the daily job). */
  private live<T extends { expectedAmount: Prisma.Decimal; dueDate: Date; payments: { amount: Prisma.Decimal }[] }>(m: T) {
    const received = sum(m.payments.map((p) => p.amount));
    return { ...m, received, outstanding: money(D(m.expectedAmount).minus(received).lt(0) ? D(0) : D(m.expectedAmount).minus(received)), status: milestoneStatus(m.expectedAmount, received, m.dueDate) as MilestoneStatus };
  }

  async forWedding(weddingId: string) {
    const [milestones, vendorPayments, wvs] = await Promise.all([
      this.prisma.paymentMilestone.findMany({ where: { weddingId }, include: { payments: { orderBy: { paidAt: 'desc' } } }, orderBy: { dueDate: 'asc' } }),
      this.prisma.vendorPayment.findMany({ where: { weddingId }, include: { weddingVendor: { include: { vendor: { select: { name: true } } } } }, orderBy: { paidAt: 'desc' } }),
      this.prisma.weddingVendor.findMany({ where: { weddingId }, select: { id: true } }),
    ]);
    const ms = milestones.map((m) => this.live(m));
    const expected = sum(ms.map((m) => m.expectedAmount)), received = sum(ms.map((m) => m.received));
    const vendors = await Promise.all(wvs.map(async (w) => { const b = await vendorBill(this.prisma, w.id); return { weddingVendorId: w.id, vendor: b.wv.vendor.name, category: b.wv.category, ...b, wv: undefined }; }));
    return { milestones: ms, totals: { expected, received, outstanding: money(expected.minus(received)) }, vendorPayments, vendorSummary: vendors };
  }

  /** Cross-wedding milestone list for the Payments screen / dashboard. */
  async milestones(q: MilestoneQuery) {
    const rows = await this.prisma.paymentMilestone.findMany({ include: { payments: true, wedding: { select: { id: true, name: true, couple: { select: { brideName: true, groomName: true } } } } }, orderBy: { dueDate: 'asc' } });
    let live = rows.map((r) => this.live(r));
    if (q.status) live = live.filter((m) => m.status === q.status);
    if (q.withinDays) live = live.filter((m) => m.status !== 'PAID' && m.dueDate.getTime() - Date.now() <= q.withinDays! * 864e5);
    if (q.search) live = live.filter((m) => m.wedding.name.toLowerCase().includes(q.search!.toLowerCase()));
    const total = live.length;
    const items = live.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    return new Paginated(items.map(({ payments, ...m }) => m), { page: q.page, pageSize: q.pageSize, total });
  }

  async upiLink(milestoneId: string) {
    const m = await this.prisma.paymentMilestone.findUnique({ where: { id: milestoneId }, include: { payments: true, wedding: { select: { name: true } } } });
    if (!m) throw new NotFoundException('Milestone not found');
    const live = this.live(m);
    if (live.outstanding.lte(0)) throw new UnprocessableEntityException('Milestone is already fully paid');
    const note = `${m.wedding.name} ${m.type}`.slice(0, 60);
    const params = new URLSearchParams({ pa: env.upiVpa, pn: 'The Royal Knot', am: live.outstanding.toFixed(2), cu: 'INR', tn: note });
    return { milestoneId, milestone: m.type, amount: live.outstanding.toFixed(2), currency: 'INR', payee: env.upiVpa, upiUri: `upi://pay?${params.toString().replace(/\+/g, '%20')}` };
  }

  newReceiptNo() { return `RK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`; }

  /**
   * Row-locks the milestone inside a transaction, so concurrent submits serialize; the unique idempotencyKey
   * turns client retries into a no-op that returns the original receipt.
   */
  async record(dto: RecordPaymentDto, actor: AuthUser) {
    const dup = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (dup) return { payment: dup, duplicate: true, tasksGenerated: null };
    try {
      const out = await this.prisma.$transaction(async (tx) => {
        const found = await tx.paymentMilestone.findUnique({ where: { weddingId_type: { weddingId: dto.weddingId, type: dto.milestone } } });
        if (!found) throw new NotFoundException('Milestone not found for this wedding');
        await tx.$queryRaw`SELECT id FROM "PaymentMilestone" WHERE id = ${found.id} FOR UPDATE`;
        const existing = await tx.clientPayment.findMany({ where: { milestoneId: found.id }, select: { amount: true } });
        const received = sum(existing.map((p) => p.amount));
        const outstanding = D(found.expectedAmount).minus(received);
        if (D(dto.amount).gt(outstanding)) throw new UnprocessableEntityException(`Amount exceeds the outstanding balance of ${inr(outstanding)} for this milestone`);
        const payment = await tx.clientPayment.create({ data: { weddingId: dto.weddingId, milestoneId: found.id, amount: dto.amount, method: dto.method, reference: dto.reference, paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(), idempotencyKey: dto.idempotencyKey, receiptNo: this.newReceiptNo(), recordedById: actor.id } });
        const status = milestoneStatus(found.expectedAmount, received.plus(dto.amount), found.dueDate);
        await tx.paymentMilestone.update({ where: { id: found.id }, data: { status } });
        await this.audit.log({ actorId: actor.id, weddingId: dto.weddingId, entity: 'ClientPayment', entityId: payment.id, action: 'record', message: `Recorded ${dto.milestone.toLowerCase()} payment ${inr(dto.amount)} (${payment.receiptNo})`, meta: { milestone: dto.milestone, method: dto.method, reference: dto.reference ?? null, status } }, tx);
        return { payment, status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      let tasksGenerated: Awaited<ReturnType<TasksService['generate']>> | null = null;
      if (dto.milestone === 'BOOKING') {
        tasksGenerated = await this.tasks.generate(dto.weddingId, {}, actor).catch(() => null);
        await this.prisma.wedding.updateMany({ where: { id: dto.weddingId, status: 'PLANNING' }, data: { status: 'VENDOR_BOOKING' } });
      }
      await this.notif.notify({ type: 'payment.received', title: 'Payment received', body: `${inr(dto.amount)} · ${dto.milestone.toLowerCase()} milestone`, link: `/weddings/${dto.weddingId}?tab=payments`, roles: ['FINANCE', 'PLANNER'] });
      return { payment: out.payment, milestoneStatus: out.status, duplicate: false, tasksGenerated };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (again) return { payment: again, duplicate: true, tasksGenerated: null };
      }
      throw e;
    }
  }

  async receipt(paymentId: string) {
    const p = await this.prisma.clientPayment.findUnique({ where: { id: paymentId }, include: { milestone: true, wedding: { include: { couple: true } } } });
    if (!p) throw new NotFoundException('Payment not found');
    const html = page('Payment Receipt', `Receipt ${p.receiptNo}`, kv([['Received from', `${p.wedding.couple.brideName} & ${p.wedding.couple.groomName}`], ['Wedding', p.wedding.name], ['Milestone', p.milestone.type], ['Amount received', inr(p.amount)], ['Payment date', dt(p.paidAt)], ['Method', p.method.replace('_', ' ')], ['Reference', p.reference ?? '—'], ['Receipt no.', p.receiptNo]]) + '<p class="muted">This is a payment tracking receipt issued by The Royal Knot.</p>');
    return new StreamableFile(await this.pdf.htmlToPdf(html), { type: 'application/pdf', disposition: `inline; filename="${p.receiptNo}.pdf"` });
  }

  /** Vendor advance / final payments. Cannot exceed what the vendor is owed; idempotent on key. */
  async recordVendor(weddingId: string, dto: RecordVendorPaymentDto, actor: AuthUser) {
    const dup = await this.prisma.vendorPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (dup) return { payment: dup, duplicate: true };
    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const wv = await tx.weddingVendor.findFirst({ where: { id: dto.weddingVendorId, weddingId } });
        if (!wv) throw new NotFoundException('Vendor is not assigned to this wedding');
        await tx.$queryRaw`SELECT id FROM "WeddingVendor" WHERE id = ${wv.id} FOR UPDATE`;
        const bill = await vendorBill(tx, wv.id);
        const cap = D(bill.finalBill).gt(bill.negotiated) ? D(bill.finalBill) : D(bill.negotiated);
        if (D(bill.paid).plus(dto.amount).gt(cap)) throw new UnprocessableEntityException(`Payment would exceed the vendor's bill (${inr(cap)}; already paid ${inr(bill.paid)})`);
        const p = await tx.vendorPayment.create({ data: { weddingId, weddingVendorId: wv.id, kind: dto.kind, amount: dto.amount, method: dto.method, reference: dto.reference, paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(), idempotencyKey: dto.idempotencyKey, recordedById: actor.id } });
        await this.audit.log({ actorId: actor.id, weddingId, entity: 'VendorPayment', entityId: p.id, action: 'record', message: `Paid vendor ${inr(dto.amount)} (${dto.kind.toLowerCase()}) — ${bill.wv.vendor.name}`, meta: { reference: dto.reference ?? null } }, tx);
        return p;
      });
      return { payment, duplicate: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.vendorPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (again) return { payment: again, duplicate: true };
      }
      throw e;
    }
  }

  /** Persists live statuses (used by the scheduled job) and returns milestones that changed. */
  async refreshStatuses() {
    const rows = await this.prisma.paymentMilestone.findMany({ include: { payments: true, wedding: { select: { name: true } } } });
    const changed: { id: string; weddingId: string; weddingName: string; type: string; status: MilestoneStatus; outstanding: Prisma.Decimal; dueDate: Date }[] = [];
    for (const r of rows) {
      const l = this.live(r);
      if (l.status !== r.status) { await this.prisma.paymentMilestone.update({ where: { id: r.id }, data: { status: l.status } }); }
      if (l.status === 'DUE' || l.status === 'OVERDUE') changed.push({ id: r.id, weddingId: r.weddingId, weddingName: r.wedding.name, type: r.type, status: l.status, outstanding: l.outstanding, dueDate: r.dueDate });
    }
    return changed;
  }

}
