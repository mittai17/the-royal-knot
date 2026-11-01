import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, StreamableFile, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { MilestoneStatus, MilestoneType, PaymentStatus, Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { AuthUser } from '../../common/decorators';
import { clientReceived, D, milestoneStatus, money, sum } from '../../common/finance';
import { assertDifferentPerson, financeLimits } from '../../common/finance-policy';
import { contractMilestoneKey, milestonePlan, splitContract } from '../../common/milestones';
import { Paginated, skipTake } from '../../common/pagination';
import { PdfService } from '../../common/pdf.service';
import { dt, inr, kv, page } from '../../common/pdf-templates';
import { vendorBill } from '../../common/vendor-bill';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WeddingsService } from '../weddings/weddings.service';
import { VendorPaymentsService } from '../vendor-payments/vendor-payments.service';
import { GatewayCallbackDto, MilestonePlanDto, MilestoneQuery, PaymentListQuery, RecordPaymentDto, RecordVendorPaymentDto, RefundPaymentDto } from './payments.dto';

/** Display / forward-only ordering of gateway states: a late "processing" callback can never undo a "succeeded" one. */
const RANK: Record<PaymentStatus, number> = { PENDING: 0, PROCESSING: 1, SUCCEEDED: 2, FAILED: 2, REFUNDED: 3 };
const EVENT_STATUS: Record<GatewayCallbackDto['event'], PaymentStatus> = { 'payment.pending': 'PENDING', 'payment.processing': 'PROCESSING', 'payment.succeeded': 'SUCCEEDED', 'payment.failed': 'FAILED', 'payment.refunded': 'REFUNDED' };

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private weddings: WeddingsService, private pdf: PdfService, private vendorPayments: VendorPaymentsService, private approvals: ApprovalsService) {}

  /** Live status (never trusts the stored value, which only changes on writes and by the daily job). Refunds (reversal rows) reduce what counts as received. */
  private live<T extends { expectedAmount: Prisma.Decimal; dueDate: Date; payments: { amount: Prisma.Decimal; status?: PaymentStatus; reversalOfId?: string | null }[] }>(m: T) {
    const received = clientReceived(m.payments);
    const outstanding = D(m.expectedAmount).minus(received);
    return { ...m, received, outstanding: money(outstanding.lt(0) ? D(0) : outstanding), status: milestoneStatus(m.expectedAmount, received, m.dueDate) as MilestoneStatus };
  }

  async forWedding(weddingId: string) {
    const [milestones, vendorPayments, wvs] = await Promise.all([
      this.prisma.paymentMilestone.findMany({ where: { weddingId }, include: { payments: { orderBy: { paidAt: 'desc' } } }, orderBy: { dueDate: 'asc' } }),
      this.prisma.vendorPayment.findMany({ where: { weddingId }, include: { weddingVendor: { include: { vendor: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.weddingVendor.findMany({ where: { weddingId }, select: { id: true } }),
    ]);
    const ms = milestones.map((m) => this.live(m));
    const expected = sum(ms.map((m) => m.expectedAmount)), received = sum(ms.map((m) => m.received));
    const vendors = await Promise.all(wvs.map(async (w) => { const b = await vendorBill(this.prisma, w.id); return { weddingVendorId: w.id, vendor: b.wv.vendor.name, category: b.wv.category, ...b, wv: undefined }; }));
    return { milestones: ms, totals: { expected, received, outstanding: money(expected.minus(received).lt(0) ? D(0) : expected.minus(received)) }, vendorPayments, vendorSummary: vendors };
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

  /** Client Payments register: every payment row (including pending / failed gateway attempts and refund entries). */
  async list(q: PaymentListQuery) {
    const where: Prisma.ClientPaymentWhereInput = {
      ...(q.status ? { status: q.status } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.milestone ? { milestone: { type: q.milestone } } : {}),
      ...(q.verified === 'true' ? { verifiedAt: { not: null } } : q.verified === 'false' ? { verifiedAt: null, reversalOfId: null, status: 'SUCCEEDED' } : {}),
      ...(q.kind === 'refunds' ? { reversalOfId: { not: null } } : q.kind === 'payments' ? { reversalOfId: null } : {}),
      ...(q.search ? { OR: [{ receiptNo: { contains: q.search, mode: 'insensitive' } }, { reference: { contains: q.search, mode: 'insensitive' } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total, all] = await Promise.all([
      this.prisma.clientPayment.findMany({ where, orderBy: { paidAt: 'desc' }, ...skipTake(q), include: { milestone: { select: { type: true } }, wedding: { select: { id: true, name: true } } } }),
      this.prisma.clientPayment.count({ where }),
      this.prisma.clientPayment.findMany({ select: { amount: true, status: true, reversalOfId: true, verifiedAt: true } }),
    ]);
    const p = new Paginated(rows.map((r) => ({ ...r, isRefund: !!r.reversalOfId, verified: !!r.verifiedAt })), { page: q.page, pageSize: q.pageSize, total });
    const unverified = all.filter((x) => !x.reversalOfId && x.status === 'SUCCEEDED' && !x.verifiedAt);
    (p.meta as Record<string, unknown>).summary = {
      received: money(clientReceived(all)), refunded: money(sum(all.filter((x) => x.reversalOfId).map((x) => x.amount))), unverifiedCount: unverified.length, unverifiedAmount: money(sum(unverified.map((x) => x.amount))),
      counts: Object.fromEntries((['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED'] as PaymentStatus[]).map((s) => [s, all.filter((x) => !x.reversalOfId && x.status === s).length])),
    };
    return p;
  }

  async get(id: string) {
    const p = await this.prisma.clientPayment.findUnique({ where: { id }, include: { milestone: { select: { type: true, expectedAmount: true } }, wedding: { select: { id: true, name: true } }, reversals: true, invoice: { select: { id: true, invoiceNo: true } } } });
    if (!p) throw new NotFoundException('Payment not found');
    const history = await this.prisma.activityLog.findMany({ where: { entity: 'ClientPayment', entityId: id }, orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true, role: true } } } });
    const refunded = sum(p.reversals.map((r) => r.amount));
    return { ...p, refunded: money(refunded), refundable: p.reversalOfId || p.status !== 'SUCCEEDED' ? D(0) : money(D(p.amount).minus(refunded)), history };
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

  /** After money lands or is verified: let the single confirmation guard decide (tasks are generated only inside confirmation). Never throws into the payment flow. */
  private async afterMoney(weddingId: string, actor?: AuthUser | null) {
    return this.weddings.confirmIfReady(weddingId, actor ?? undefined).catch(() => null);
  }

  /**
   * Row-locks the milestone inside a transaction, so concurrent submits serialize; the unique idempotencyKey
   * turns client retries into a no-op that returns the original receipt. The payment is SUCCEEDED but not yet verified:
   * a second person confirms funds with POST /payments/:id/verify (that is what a booking confirmation reads).
   */
  async record(dto: RecordPaymentDto, actor: AuthUser) {
    const dup = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (dup) return { payment: dup, duplicate: true, confirmation: null };
    try {
      const out = await this.prisma.$transaction(async (tx) => {
        const found = await tx.paymentMilestone.findUnique({ where: { weddingId_type: { weddingId: dto.weddingId, type: dto.milestone } } });
        if (!found) throw new NotFoundException('Milestone not found for this wedding');
        await tx.$queryRaw`SELECT id FROM "PaymentMilestone" WHERE id = ${found.id} FOR UPDATE`;
        const existing = await tx.clientPayment.findMany({ where: { milestoneId: found.id }, select: { amount: true, status: true, reversalOfId: true } });
        const received = clientReceived(existing);
        const outstanding = D(found.expectedAmount).minus(received);
        if (D(dto.amount).gt(outstanding)) throw new UnprocessableEntityException(`Amount exceeds the outstanding balance of ${inr(outstanding)} for this milestone`);
        const payment = await tx.clientPayment.create({ data: { weddingId: dto.weddingId, milestoneId: found.id, amount: dto.amount, method: dto.method, reference: dto.reference, paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(), idempotencyKey: dto.idempotencyKey, receiptNo: this.newReceiptNo(), recordedById: actor.id, status: 'SUCCEEDED' } });
        const status = milestoneStatus(found.expectedAmount, received.plus(dto.amount), found.dueDate);
        await tx.paymentMilestone.update({ where: { id: found.id }, data: { status } });
        await this.audit.log({ actorId: actor.id, weddingId: dto.weddingId, entity: 'ClientPayment', entityId: payment.id, action: 'record', message: `Recorded ${dto.milestone.toLowerCase()} payment ${inr(dto.amount)} (${payment.receiptNo})`, meta: { milestone: dto.milestone, method: dto.method, reference: dto.reference ?? null, status } }, tx);
        return { payment, status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      const confirmation = dto.milestone === 'BOOKING' ? await this.afterMoney(dto.weddingId, actor) : null;
      await this.notif.notify({ type: 'payment.received', title: 'Payment received', body: `${inr(dto.amount)} · ${dto.milestone.toLowerCase()} milestone — awaiting verification`, link: `/weddings/${dto.weddingId}?tab=payments`, roles: ['FINANCE', 'PLANNER'] });
      return { payment: out.payment, milestoneStatus: out.status, duplicate: false, confirmation };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (again) return { payment: again, duplicate: true, confirmation: null };
      }
      throw e;
    }
  }

  /** Finance confirms the funds are in the bank. A different person from whoever recorded it (maker-checker). Idempotent. */
  async verify(id: string, note: string | undefined, actor: AuthUser) {
    const p = await this.prisma.clientPayment.findUnique({ where: { id }, include: { milestone: { select: { type: true } } } });
    if (!p) throw new NotFoundException('Payment not found');
    if (p.reversalOfId) throw new UnprocessableEntityException('A refund entry does not need verification');
    if (p.status !== 'SUCCEEDED') throw new UnprocessableEntityException(`Only a received payment can be verified (this one is ${p.status.toLowerCase()})`);
    if (p.verifiedAt) return this.get(id);
    assertDifferentPerson(actor.id, p.recordedById, 'you recorded this payment, so someone else must verify it');
    const c = await this.prisma.clientPayment.updateMany({ where: { id, verifiedAt: null }, data: { verifiedAt: new Date(), verifiedById: actor.id } });
    if (c.count) await this.audit.log({ actorId: actor.id, weddingId: p.weddingId, entity: 'ClientPayment', entityId: id, action: 'verify', message: `Verified ${p.milestone.type.toLowerCase()} payment ${inr(p.amount)} (${p.receiptNo})${note ? ` — ${note}` : ''}`, meta: { milestone: p.milestone.type, recordedById: p.recordedById } });
    if (p.milestone.type === 'BOOKING') await this.afterMoney(p.weddingId, actor);
    return this.get(id);
  }

  /**
   * A refund is a REVERSAL entry (a new row pointing at the payment); the original is never edited away or deleted. Capped at what is left to refund.
   * Non-Founder refunds above the "clientRefund" limit (default: every refund) need an approved client-refund request raised on the payment.
   */
  async refund(id: string, dto: RefundPaymentDto, actor: AuthUser) {
    const key = `refund:${dto.idempotencyKey}`;
    const dup = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: key } });
    if (dup) return { refund: dup, duplicate: true };
    const orig = await this.prisma.clientPayment.findUnique({ where: { id }, include: { reversals: true, milestone: { select: { type: true } } } });
    if (!orig) throw new NotFoundException('Payment not found');
    if (orig.reversalOfId) throw new UnprocessableEntityException('A refund entry cannot be refunded again');
    if (orig.status !== 'SUCCEEDED') throw new UnprocessableEntityException(`Only a received payment can be refunded (this one is ${orig.status.toLowerCase()})`);
    const left = D(orig.amount).minus(sum(orig.reversals.map((r) => r.amount)));
    const amount = D(dto.amount ?? left);
    if (amount.lte(0) || amount.gt(left)) throw new UnprocessableEntityException(`Refund must be between 0.01 and the ${inr(left)} still refundable on this payment`);
    let approvalId: string | null = null;
    if (actor.role !== 'FOUNDER') {
      const limits = await financeLimits(this.prisma);
      if (amount.gt(limits.clientRefund)) {
        const used = (await this.prisma.activityLog.findMany({ where: { entity: 'ClientPayment', entityId: id, action: 'refund' }, select: { meta: true } })).map((l) => (l.meta as { approvalId?: string } | null)?.approvalId);
        const approved = await this.prisma.approval.findFirst({ where: { entity: 'ClientPayment', entityId: id, sourceModule: 'client-refund', status: 'APPROVED', amount: { gte: money(amount) } }, orderBy: { decidedAt: 'desc' } });
        if (!approved || used.includes(approved.id)) {
          const req = await this.approvals.requestFor({ type: 'OTHER', title: `Refund ${inr(amount)} on ${orig.receiptNo}`, reason: dto.reason, description: dto.reason, amount, weddingId: orig.weddingId, entity: 'ClientPayment', entityId: id, sourceModule: 'client-refund', sourceId: id }, actor);
          return { approvalRequired: true, approval: { id: req.id, reference: req.reference, status: req.status }, message: `A refund of ${inr(amount)} needs Founder approval first (request ${req.reference}). Re-submit once it is approved.` };
        }
        approvalId = approved.id;
      }
    }
    try {
      const out = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PaymentMilestone" WHERE id = ${orig.milestoneId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ClientPayment" WHERE id = ${id} FOR UPDATE`;
        const fresh = await tx.clientPayment.findUniqueOrThrow({ where: { id }, include: { reversals: true } });
        const remaining = D(fresh.amount).minus(sum(fresh.reversals.map((r) => r.amount)));
        if (amount.gt(remaining)) throw new UnprocessableEntityException(`Only ${inr(remaining)} is still refundable on this payment`);
        const now = new Date();
        const refund = await tx.clientPayment.create({ data: { weddingId: orig.weddingId, milestoneId: orig.milestoneId, invoiceId: orig.invoiceId, amount: money(amount), method: orig.method, reference: `Refund of ${orig.receiptNo}: ${dto.reason}`.slice(0, 250), paidAt: now, idempotencyKey: key, receiptNo: this.newReceiptNo(), recordedById: actor.id, status: 'SUCCEEDED', reversalOfId: id, verifiedAt: now, verifiedById: actor.id } });
        const full = amount.gte(remaining);
        if (full) await tx.clientPayment.update({ where: { id }, data: { status: 'REFUNDED', reversedAt: now } });
        const m = await tx.paymentMilestone.findUniqueOrThrow({ where: { id: orig.milestoneId }, include: { payments: true } });
        const live = this.live(m);
        await tx.paymentMilestone.update({ where: { id: m.id }, data: { status: live.status } });
        if (orig.invoiceId) {
          await tx.$queryRaw`SELECT id FROM "ClientInvoice" WHERE id = ${orig.invoiceId} FOR UPDATE`;
          const inv = await tx.clientInvoice.findUniqueOrThrow({ where: { id: orig.invoiceId } });
          const paid = money(D(inv.amountPaid).minus(amount).lt(0) ? D(0) : D(inv.amountPaid).minus(amount));
          await tx.clientInvoice.update({ where: { id: inv.id }, data: { amountPaid: paid, ...(inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID' ? { status: paid.gte(D(inv.total)) ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'SENT' } : {}) } });
        }
        await this.audit.log({ actorId: actor.id, weddingId: orig.weddingId, entity: 'ClientPayment', entityId: id, action: 'refund', message: `Refunded ${inr(amount)} of ${orig.receiptNo} — ${dto.reason}`, meta: { refundId: refund.id, reason: dto.reason, approvalId, full, amount: amount.toString() } }, tx);
        return refund;
      }, { timeout: 20000 });
      return { refund: out, duplicate: false, payment: await this.get(id) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: key } });
        if (again) return { refund: again, duplicate: true };
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------ gateway callbacks

  private secretFor(provider: string) {
    return process.env[`PAYMENT_GATEWAY_SECRET_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] ?? process.env.PAYMENT_GATEWAY_SECRET ?? '';
  }

  /** Shared secret (`x-gateway-secret`) or HMAC-SHA256 of the JSON body (`x-signature`, optionally `sha256=` prefixed). Never open: an unset secret disables the endpoint. */
  assertCallbackAuthentic(provider: string, body: unknown, headers: Record<string, string | string[] | undefined>) {
    const secret = this.secretFor(provider);
    if (!secret) throw new ServiceUnavailableException('Payment gateway callbacks are not configured');
    const h = (n: string) => { const v = headers[n]; return (Array.isArray(v) ? v[0] : v) ?? ''; };
    const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
    const given = h('x-gateway-secret');
    if (given && safeEq(given, secret)) return;
    const sig = h('x-signature').replace(/^sha256=/, '');
    if (sig && safeEq(sig, createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex'))) return;
    throw new UnauthorizedException('Invalid gateway signature');
  }

  /**
   * Gateway webhook. Idempotent by (provider, gatewayRef): the row's unique idempotencyKey is `gw:<provider>:<gatewayRef>`, so any number of repeated
   * callbacks (even concurrent ones) resolve to one payment. States only move forward (pending -> processing -> succeeded|failed -> refunded).
   * A succeeded callback counts as verified (the gateway is the verification). Over-collection is recorded, not rejected, and surfaces in the reconciliation queue.
   */
  async gatewayCallback(provider: string, dto: GatewayCallbackDto) {
    const key = `gw:${provider.toLowerCase()}:${dto.gatewayRef}`;
    const target = EVENT_STATUS[dto.event];
    const existing = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: key } });
    if (existing) return this.advanceGateway(existing, target, provider, dto);
    let milestone = dto.milestoneId ? await this.prisma.paymentMilestone.findUnique({ where: { id: dto.milestoneId } }) : dto.weddingId && dto.milestone ? await this.prisma.paymentMilestone.findUnique({ where: { weddingId_type: { weddingId: dto.weddingId, type: dto.milestone } } }) : null;
    if (!milestone) throw new UnprocessableEntityException('Callback must identify a milestone (milestoneId, or weddingId + milestone)');
    if (target === 'REFUNDED') throw new UnprocessableEntityException('Refund callback for an unknown payment');
    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PaymentMilestone" WHERE id = ${milestone!.id} FOR UPDATE`;
        const p = await tx.clientPayment.create({ data: { weddingId: milestone!.weddingId, milestoneId: milestone!.id, amount: money(D(dto.amount)), method: dto.method ?? 'OTHER', reference: dto.reference ?? `${provider}:${dto.gatewayRef}`, paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(), idempotencyKey: key, receiptNo: this.newReceiptNo(), status: target, gatewayRef: dto.gatewayRef, ...(target === 'SUCCEEDED' ? { verifiedAt: new Date() } : {}) } });
        if (target === 'SUCCEEDED') await this.refreshMilestone(tx, milestone!.id);
        await this.audit.log({ actorId: null, weddingId: milestone!.weddingId, entity: 'ClientPayment', entityId: p.id, action: 'gateway', message: `${provider} ${dto.event} ${inr(dto.amount)} (${dto.gatewayRef})`, meta: { provider, gatewayRef: dto.gatewayRef, event: dto.event, status: target } }, tx);
        return p;
      });
      if (target === 'SUCCEEDED') await this.afterGatewaySuccess(payment.weddingId, milestone.type, dto.amount);
      return { received: true, duplicate: false, paymentId: payment.id, status: payment.status };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: key } });
        if (again) return this.advanceGateway(again, target, provider, dto);
      }
      throw e;
    }
  }

  private async refreshMilestone(tx: Prisma.TransactionClient, milestoneId: string) {
    const m = await tx.paymentMilestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { payments: true } });
    await tx.paymentMilestone.update({ where: { id: milestoneId }, data: { status: this.live(m).status } });
  }

  private async afterGatewaySuccess(weddingId: string, milestone: MilestoneType, amount: number) {
    if (milestone === 'BOOKING') await this.afterMoney(weddingId, null);
    await this.notif.notify({ type: 'payment.received', title: 'Online payment received', body: `${inr(amount)} · ${milestone.toLowerCase()} milestone`, link: `/weddings/${weddingId}?tab=payments`, roles: ['FINANCE', 'PLANNER'] }).catch(() => undefined);
  }

  private async advanceGateway(existing: Prisma.ClientPaymentGetPayload<object>, target: PaymentStatus, provider: string, dto: GatewayCallbackDto) {
    const same = { received: true, duplicate: true, paymentId: existing.id, status: existing.status };
    if (RANK[target] <= RANK[existing.status] && !(target === 'REFUNDED' && existing.status === 'SUCCEEDED')) return same;
    if (existing.status === 'FAILED' || existing.status === 'REFUNDED') return same; // terminal
    if (target === 'REFUNDED') {
      if (existing.reversedAt) return same;
      const key = `gw-refund:${provider.toLowerCase()}:${dto.gatewayRef}`;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "ClientPayment" WHERE id = ${existing.id} FOR UPDATE`;
          const cur = await tx.clientPayment.findUniqueOrThrow({ where: { id: existing.id } });
          if (cur.reversedAt) return;
          const now = new Date();
          await tx.clientPayment.create({ data: { weddingId: cur.weddingId, milestoneId: cur.milestoneId, invoiceId: cur.invoiceId, amount: cur.amount, method: cur.method, reference: `Gateway refund of ${cur.receiptNo}`, paidAt: now, idempotencyKey: key, receiptNo: this.newReceiptNo(), status: 'SUCCEEDED', reversalOfId: cur.id, gatewayRef: dto.gatewayRef, verifiedAt: now } });
          await tx.clientPayment.update({ where: { id: cur.id }, data: { status: 'REFUNDED', reversedAt: now } });
          await this.refreshMilestone(tx, cur.milestoneId);
          await this.audit.log({ actorId: null, weddingId: cur.weddingId, entity: 'ClientPayment', entityId: cur.id, action: 'refund', message: `${provider} refunded ${inr(cur.amount)} (${dto.gatewayRef})`, meta: { provider, gatewayRef: dto.gatewayRef, gateway: true } }, tx);
        });
      } catch (e) { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; }
      return { received: true, duplicate: false, paymentId: existing.id, status: 'REFUNDED' as PaymentStatus };
    }
    const upd = await this.prisma.$transaction(async (tx) => {
      // compare-and-set so two racing callbacks cannot both apply the same transition
      const c = await tx.clientPayment.updateMany({ where: { id: existing.id, status: existing.status }, data: { status: target, ...(target === 'SUCCEEDED' ? { verifiedAt: new Date(), paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date() } : {}) } });
      if (!c.count) return false;
      await this.refreshMilestone(tx, existing.milestoneId);
      await this.audit.log({ actorId: null, weddingId: existing.weddingId, entity: 'ClientPayment', entityId: existing.id, action: 'gateway', message: `${provider} ${dto.event} ${inr(existing.amount)} (${dto.gatewayRef})`, meta: { provider, gatewayRef: dto.gatewayRef, event: dto.event, status: target } }, tx);
      return true;
    });
    if (!upd) return same;
    if (target === 'SUCCEEDED') { const m = await this.prisma.paymentMilestone.findUnique({ where: { id: existing.milestoneId }, select: { type: true } }); if (m) await this.afterGatewaySuccess(existing.weddingId, m.type, Number(existing.amount)); }
    return { received: true, duplicate: false, paymentId: existing.id, status: target };
  }

  // ------------------------------------------------------------------ per-contract milestone plan

  /**
   * Sets this contract's own milestone split. Give BOOKING and ADVANCE as a percent or a rupee amount; FINAL is always the remainder (so the three
   * add up to the contract plus approved extras). Nothing is hardcoded: contracts without an override use the Business Settings template.
   */
  async setMilestonePlan(weddingId: string, dto: MilestonePlanDto, actor: AuthUser) {
    const w = await this.prisma.wedding.findUnique({ where: { id: weddingId }, select: { id: true, contractValue: true } });
    if (!w) throw new NotFoundException('Wedding not found');
    const contract = D(w.contractValue);
    if (contract.lte(0)) throw new UnprocessableEntityException('Set the contract value before configuring milestones');
    const give = (t: MilestoneType) => dto.milestones.find((m) => m.type === t);
    const pctOf = (t: MilestoneType) => { const m = give(t); if (!m) throw new BadRequestException(`${t} is required`); if (m.percent == null && m.amount == null) throw new BadRequestException(`${t} needs a percent or an amount`); return m.percent != null ? D(m.percent) : D(m.amount).div(contract).times(100); };
    const booking = pctOf('BOOKING'), advance = pctOf('ADVANCE');
    if (booking.lt(0) || advance.lt(0) || booking.plus(advance).gt(100)) throw new UnprocessableEntityException('Booking + advance cannot exceed the full contract');
    const plan = [{ type: 'BOOKING' as const, percent: booking.toDecimalPlaces(6).toNumber() }, { type: 'ADVANCE' as const, percent: advance.toDecimalPlaces(6).toNumber() }, { type: 'FINAL' as const, percent: D(100).minus(booking).minus(advance).toDecimalPlaces(6).toNumber() }];
    const extras = sum((await this.prisma.additionalCharge.findMany({ where: { approved: true, billToClient: true, reconciliation: { weddingId } }, select: { amount: true } })).map((c) => c.amount));
    const amounts = splitContract(plan, contract, extras);
    await this.prisma.$transaction(async (tx) => {
      const ms = await tx.paymentMilestone.findMany({ where: { weddingId }, include: { payments: true } });
      for (const m of ms) {
        const received = clientReceived(m.payments);
        if (amounts[m.type].lt(received)) throw new UnprocessableEntityException(`${m.type} already has ${inr(received)} paid; it cannot be set lower than that`);
      }
      for (const m of ms) {
        const due = give(m.type)?.dueDate;
        await tx.paymentMilestone.update({ where: { id: m.id }, data: { expectedAmount: amounts[m.type], ...(due ? { dueDate: new Date(due) } : {}) } });
      }
      await tx.systemSetting.upsert({ where: { key: contractMilestoneKey(weddingId) }, create: { key: contractMilestoneKey(weddingId), value: plan, updatedById: actor.id }, update: { value: plan, updatedById: actor.id } });
      await this.audit.log({ actorId: actor.id, weddingId, entity: 'PaymentMilestone', action: 'plan', message: `Set contract milestone plan: booking ${inr(amounts.BOOKING)}, advance ${inr(amounts.ADVANCE)}, final ${inr(amounts.FINAL)}`, meta: { plan, amounts: { BOOKING: amounts.BOOKING.toString(), ADVANCE: amounts.ADVANCE.toString(), FINAL: amounts.FINAL.toString() } } }, tx);
    });
    return { ...(await milestonePlan(this.prisma, weddingId)), amounts, ...(await this.forWedding(weddingId)) };
  }

  async getMilestonePlan(weddingId: string) {
    const w = await this.prisma.wedding.findUnique({ where: { id: weddingId }, select: { contractValue: true } });
    if (!w) throw new NotFoundException('Wedding not found');
    const { plan, source } = await milestonePlan(this.prisma, weddingId);
    return { source, plan, amounts: splitContract(plan, w.contractValue) };
  }

  async receipt(paymentId: string) {
    const p = await this.prisma.clientPayment.findUnique({ where: { id: paymentId }, include: { milestone: true, wedding: { include: { couple: true } } } });
    if (!p) throw new NotFoundException('Payment not found');
    const html = page('Payment Receipt', `Receipt ${p.receiptNo}`, kv([['Received from', `${p.wedding.couple.brideName} & ${p.wedding.couple.groomName}`], ['Wedding', p.wedding.name], ['Milestone', p.milestone.type], ['Amount received', inr(p.amount)], ['Payment date', dt(p.paidAt)], ['Method', p.method.replace('_', ' ')], ['Reference', p.reference ?? '—'], ['Receipt no.', p.receiptNo]]) + '<p class="muted">This is a payment tracking receipt issued by The Royal Knot.</p>');
    return new StreamableFile(await this.pdf.htmlToPdf(html), { type: 'application/pdf', disposition: `inline; filename="${p.receiptNo}.pdf"` });
  }

  /** Legacy vendor advance / final route: delegates to Vendor Payments (direct path: Finance up to the approval limit, Founder any amount). */
  recordVendor(weddingId: string, dto: RecordVendorPaymentDto, actor: AuthUser) {
    return this.vendorPayments.recordDirect(weddingId, dto, actor);
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
