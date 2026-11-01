import { BadRequestException, Injectable, NotFoundException, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, money, sum } from '../../common/finance';
import { Paginated } from '../../common/pagination';
import { PdfService } from '../../common/pdf.service';
import { dt, inr, kv, page, table } from '../../common/pdf-templates';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateInvoiceDto, InvoicePaymentDto, InvoiceQuery, UpdateInvoiceDto } from './invoices.dto';
import { computeInvoice, InvoiceLineInput, invoiceStatus, nextNumber, outstanding } from './invoice-math';

const include = {
  wedding: { select: { id: true, name: true, couple: { select: { brideName: true, groomName: true, email: true } } } },
  lines: true,
} satisfies Prisma.ClientInvoiceInclude;
type Inv = Prisma.ClientInvoiceGetPayload<{ include: typeof include }>;

/** ClientPayment.idempotencyKey prefix that links a payment to its invoice (derives amountPaid without a schema change). */
export const invoiceKeyPrefix = (invoiceId: string) => `inv:${invoiceId}:`;

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private payments: PaymentsService, private approvals: ApprovalsService, private pdf: PdfService) {}

  private shape(i: Inv, now = new Date()) {
    return { ...i, status: invoiceStatus(i, now), storedStatus: i.status, outstanding: outstanding(i.total, i.amountPaid), couple: i.wedding.couple };
  }

  private async nextInvoiceNo(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ClientInvoice.invoiceNo'))`;
    const year = new Date().getFullYear();
    const last = await tx.clientInvoice.findFirst({ where: { invoiceNo: { startsWith: `INV-${year}-` } }, orderBy: { invoiceNo: 'desc' }, select: { invoiceNo: true } });
    return nextNumber('INV', last?.invoiceNo ?? null, year);
  }

  private calc(lines: InvoiceLineInput[], discount?: Prisma.Decimal.Value) {
    try { return computeInvoice(lines, discount ?? 0); } catch (e) { throw new UnprocessableEntityException((e as Error).message); }
  }

  async list(q: InvoiceQuery) {
    const now = new Date();
    // OVERDUE is derived, so status filters are expressed as predicates on stored state + dates.
    const open: ClientInvoiceStatus[] = ['SENT', 'PARTIALLY_PAID'];
    const statusWhere: Prisma.ClientInvoiceWhereInput = !q.status ? {} : q.status === 'OVERDUE' ? { status: { in: open }, dueDate: { lt: new Date(now.getTime() - 24 * 3600 * 1000 + 1) } }
      : q.status === 'SENT' || q.status === 'PARTIALLY_PAID' ? { status: { in: open }, OR: [{ dueDate: null }, { dueDate: { gte: new Date(now.getTime() - 24 * 3600 * 1000 + 1) } }] } : { status: q.status };
    const where: Prisma.ClientInvoiceWhereInput = {
      ...statusWhere, ...(q.weddingId ? { weddingId: q.weddingId } : {}),
      ...(q.search ? { AND: [{ OR: [{ invoiceNo: { contains: q.search, mode: 'insensitive' } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] }] } : {}),
    };
    const [rows, total, all] = await Promise.all([
      this.prisma.clientInvoice.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.clientInvoice.count({ where }),
      this.prisma.clientInvoice.findMany({ where: { status: { not: 'CANCELLED' } }, select: { status: true, total: true, amountPaid: true, dueDate: true } }),
    ]);
    const p = new Paginated(rows.map((r) => this.shape(r, now)), { page: q.page, pageSize: q.pageSize, total });
    (p.meta as Record<string, unknown>).summary = this.summarize(all, now);
    return p;
  }

  summarize(all: { status: ClientInvoiceStatus; total: Prisma.Decimal; amountPaid: Prisma.Decimal; dueDate: Date | null }[], now = new Date()) {
    const live = all.map((a) => ({ ...a, live: invoiceStatus(a, now) }));
    const by = (s: ClientInvoiceStatus) => live.filter((x) => x.live === s);
    const out = (xs: typeof live) => money(sum(xs.map((x) => outstanding(x.total, x.amountPaid))));
    return {
      invoiced: money(sum(live.filter((x) => x.live !== 'DRAFT').map((x) => x.total))), collected: money(sum(live.map((x) => x.amountPaid))),
      outstanding: out(live.filter((x) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(x.live))), overdue: out(by('OVERDUE')),
      counts: { DRAFT: by('DRAFT').length, SENT: by('SENT').length, PARTIALLY_PAID: by('PARTIALLY_PAID').length, PAID: by('PAID').length, OVERDUE: by('OVERDUE').length },
    };
  }

  async get(id: string) {
    const i = await this.prisma.clientInvoice.findUnique({ where: { id }, include });
    if (!i) throw new NotFoundException('Invoice not found');
    const [payments, approval] = await Promise.all([
      this.prisma.clientPayment.findMany({ where: { OR: [{ invoiceId: id }, { idempotencyKey: { startsWith: invoiceKeyPrefix(id) } }] }, orderBy: { paidAt: 'desc' }, include: { milestone: { select: { type: true } } } }),
      this.approvals.latestFor('ClientInvoice', id, 'CLIENT_DISCOUNT'),
    ]);
    return { ...this.shape(i), payments, discountApproval: approval ? { id: approval.id, status: approval.status } : null };
  }

  private async assertMilestone(weddingId: string, milestoneId?: string) {
    if (!milestoneId) return;
    if (!(await this.prisma.paymentMilestone.count({ where: { id: milestoneId, weddingId } }))) throw new BadRequestException('Milestone does not belong to this wedding');
  }

  async create(dto: CreateInvoiceDto, actor: AuthUser) {
    if (!(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    await this.assertMilestone(dto.weddingId, dto.milestoneId);
    const c = this.calc(dto.lines, dto.discount);
    const issue = dto.issueDate ? new Date(dto.issueDate) : new Date();
    const due = dto.dueDate ? new Date(dto.dueDate) : new Date(issue.getTime() + 15 * 864e5);
    if (due < new Date(issue.toDateString())) throw new BadRequestException('Due date cannot be before the issue date');
    const inv = await this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.nextInvoiceNo(tx);
      const created = await tx.clientInvoice.create({
        data: { invoiceNo, weddingId: dto.weddingId, milestoneId: dto.milestoneId, issueDate: issue, dueDate: due, subtotal: c.subtotal, taxTotal: c.taxTotal, discount: c.discount, total: c.total, notes: dto.notes, createdById: actor.id, lines: { create: c.lines.map(({ tax: _t, ...l }) => l) } },
        include,
      });
      await this.audit.log({ actorId: actor.id, weddingId: dto.weddingId, entity: 'ClientInvoice', entityId: created.id, action: 'create', message: `Created invoice ${invoiceNo} for ${inr(c.total)}`, meta: { lines: c.lines.length, discount: c.discount.toString() } }, tx);
      if (c.discount.gt(0)) {
        await this.approvals.requestFor({ type: 'CLIENT_DISCOUNT', title: `Discount ${inr(c.discount)} on ${invoiceNo}`, description: `${created.wedding.name} · invoice total ${inr(c.total)}`, reason: dto.notes ?? 'Client discount on invoice', amount: c.discount, weddingId: dto.weddingId, entity: 'ClientInvoice', entityId: created.id, sourceModule: 'invoices', sourceId: created.id }, actor, tx);
      }
      return created;
    });
    return this.shape(inv);
  }

  async update(id: string, dto: UpdateInvoiceDto, actor: AuthUser) {
    const cur = await this.prisma.clientInvoice.findUnique({ where: { id }, include });
    if (!cur) throw new NotFoundException('Invoice not found');
    if (cur.status !== 'DRAFT') throw new UnprocessableEntityException('Only draft invoices can be edited');
    await this.assertMilestone(cur.weddingId, dto.milestoneId);
    const lines = dto.lines ?? cur.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate }));
    const c = this.calc(lines, dto.discount ?? cur.discount);
    const inv = await this.prisma.$transaction(async (tx) => {
      if (dto.lines) await tx.clientInvoiceLine.deleteMany({ where: { invoiceId: id } });
      const u = await tx.clientInvoice.update({
        where: { id },
        data: { milestoneId: dto.milestoneId, issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, notes: dto.notes, subtotal: c.subtotal, taxTotal: c.taxTotal, discount: c.discount, total: c.total, ...(dto.lines ? { lines: { create: c.lines.map(({ tax: _t, ...l }) => l) } } : {}) },
        include,
      });
      await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'ClientInvoice', entityId: id, action: 'update', message: `Edited draft invoice ${cur.invoiceNo} (${inr(c.total)})` }, tx);
      if (c.discount.gt(0) && !c.discount.eq(cur.discount)) {
        await tx.approval.updateMany({ where: { entity: 'ClientInvoice', entityId: id, type: 'CLIENT_DISCOUNT', status: { in: ['PENDING', 'IN_REVIEW'] } }, data: { status: 'CANCELLED', decisionNote: 'Superseded by an edit' } });
        await this.approvals.requestFor({ type: 'CLIENT_DISCOUNT', title: `Discount ${inr(c.discount)} on ${cur.invoiceNo}`, reason: dto.notes ?? 'Client discount on invoice', amount: c.discount, weddingId: cur.weddingId, entity: 'ClientInvoice', entityId: id, sourceModule: 'invoices', sourceId: id }, actor, tx);
      }
      return u;
    });
    return this.shape(inv);
  }

  async send(id: string, actor: AuthUser) {
    const cur = await this.prisma.clientInvoice.findUnique({ where: { id }, include });
    if (!cur) throw new NotFoundException('Invoice not found');
    if (cur.status !== 'DRAFT') throw new UnprocessableEntityException(`Invoice is already ${cur.status.toLowerCase().replace('_', ' ')}`);
    if (D(cur.discount).gt(0)) {
      const ap = await this.approvals.latestFor('ClientInvoice', id, 'CLIENT_DISCOUNT');
      if (ap?.status !== 'APPROVED') throw new UnprocessableEntityException('This invoice carries a discount that needs Founder approval before it can be sent');
    }
    const claim = await this.prisma.clientInvoice.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'SENT', sentAt: new Date() } });
    if (!claim.count) throw new UnprocessableEntityException('Invoice was already sent');
    await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'ClientInvoice', entityId: id, action: 'send', message: `Sent invoice ${cur.invoiceNo} (${inr(cur.total)}) to ${cur.wedding.name}` });
    await this.notif.notify({ type: 'invoice.sent', title: 'Invoice sent', body: `${cur.invoiceNo} · ${inr(cur.total)} · ${cur.wedding.name}`, link: '/invoices', roles: ['FINANCE', 'PLANNER'] }).catch(() => undefined);
    return this.get(id);
  }

  async remind(id: string, actor: AuthUser) {
    const cur = await this.prisma.clientInvoice.findUnique({ where: { id }, include });
    if (!cur) throw new NotFoundException('Invoice not found');
    const live = invoiceStatus(cur);
    if (!['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(live)) throw new UnprocessableEntityException('Reminders can only be sent for open invoices');
    if (cur.lastReminderAt && Date.now() - cur.lastReminderAt.getTime() < 60_000) throw new UnprocessableEntityException('A reminder was just sent for this invoice');
    await this.prisma.clientInvoice.update({ where: { id }, data: { lastReminderAt: new Date() } });
    await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'ClientInvoice', entityId: id, action: 'remind', message: `Payment reminder for ${cur.invoiceNo} — ${inr(outstanding(cur.total, cur.amountPaid))} outstanding` });
    // Delivered in-app to the planning team; there is no outbound e-mail channel wired yet (see PROJECT_STATUS).
    await this.notif.notify({ type: 'invoice.reminder', title: 'Invoice payment reminder', body: `${cur.invoiceNo} · ${inr(outstanding(cur.total, cur.amountPaid))} due from ${cur.wedding.name}`, link: '/invoices', roles: ['FINANCE', 'PLANNER'] }).catch(() => undefined);
    return this.get(id);
  }

  async void(id: string, reason: string | undefined, actor: AuthUser) {
    const cur = await this.prisma.clientInvoice.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Invoice not found');
    if (D(cur.amountPaid).gt(0)) throw new UnprocessableEntityException('An invoice with recorded payments cannot be voided');
    if (cur.status === 'CANCELLED') return this.get(id);
    await this.prisma.clientInvoice.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'ClientInvoice', entityId: id, action: 'void', message: `Voided invoice ${cur.invoiceNo}${reason ? ` — ${reason}` : ''}` });
    return this.get(id);
  }

  /**
   * Records money against an invoice by creating a normal ClientPayment on the linked milestone (so Payments, receipts, dashboards and
   * reconciliation all see it). The invoice row is locked, the payment key is namespaced to the invoice, and a retry with the same key is a no-op.
   */
  async recordPayment(id: string, dto: InvoicePaymentDto, actor: AuthUser) {
    const key = invoiceKeyPrefix(id) + dto.idempotencyKey;
    const dup = await this.prisma.clientPayment.findUnique({ where: { idempotencyKey: key } });
    if (dup) return { payment: dup, duplicate: true, invoice: await this.get(id) };
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ClientInvoice" WHERE id = ${id} FOR UPDATE`;
      const inv = await tx.clientInvoice.findUnique({ where: { id }, include: { wedding: { select: { name: true } } } });
      if (!inv) throw new NotFoundException('Invoice not found');
      // A concurrent request with the same key may have finished while we waited for the lock.
      const done = await tx.clientPayment.findUnique({ where: { idempotencyKey: key } });
      if (done) return { payment: done, duplicate: true } as Awaited<ReturnType<PaymentsService['record']>>;
      if (inv.status === 'DRAFT') throw new UnprocessableEntityException('Send the invoice before recording payments');
      if (inv.status === 'CANCELLED') throw new UnprocessableEntityException('This invoice is void');
      const due = outstanding(inv.total, inv.amountPaid);
      if (D(dto.amount).gt(due)) throw new UnprocessableEntityException(`Amount exceeds the outstanding balance of ${inr(due)} on ${inv.invoiceNo}`);
      let type = dto.milestone;
      if (inv.milestoneId) type = (await tx.paymentMilestone.findUniqueOrThrow({ where: { id: inv.milestoneId }, select: { type: true } })).type;
      if (!type) throw new UnprocessableEntityException('Choose which payment milestone this payment counts toward (the invoice is not linked to one)');
      const res = await this.payments.record({ weddingId: inv.weddingId, milestone: type, amount: dto.amount, method: dto.method, reference: dto.reference ?? inv.invoiceNo, paidAt: dto.paidAt, idempotencyKey: key }, actor);
      if (res.duplicate) return res;
      await tx.clientPayment.update({ where: { id: res.payment.id }, data: { invoiceId: id } });
      const paid = money(D(inv.amountPaid).plus(dto.amount));
      const status = invoiceStatus({ status: 'SENT', total: inv.total, amountPaid: paid, dueDate: inv.dueDate });
      await tx.clientInvoice.update({ where: { id }, data: { amountPaid: paid, status: status === 'OVERDUE' ? (paid.gt(0) ? 'PARTIALLY_PAID' : 'SENT') : status } });
      await this.audit.log({ actorId: actor.id, weddingId: inv.weddingId, entity: 'ClientInvoice', entityId: id, action: 'payment', message: `Recorded ${inr(dto.amount)} against ${inv.invoiceNo} (${res.payment.receiptNo})`, meta: { paymentId: res.payment.id, status } }, tx);
      return res;
    }, { timeout: 20000 });
    return { payment: out.payment, duplicate: out.duplicate, invoice: await this.get(id) };
  }

  async renderPdf(id: string) {
    const i = await this.prisma.clientInvoice.findUnique({ where: { id }, include });
    if (!i) throw new NotFoundException('Invoice not found');
    const s = this.shape(i);
    const html = page(`Invoice ${i.invoiceNo}`, `${i.wedding.name} · ${s.status.replace('_', ' ')}`,
      kv([['Billed to', i.wedding.couple ? `${i.wedding.couple.brideName} & ${i.wedding.couple.groomName}` : i.wedding.name], ['Wedding', i.wedding.name], ['Invoice no.', i.invoiceNo], ['Issue date', dt(i.issueDate)], ['Due date', dt(i.dueDate)]])
      + table([{ label: 'Description' }, { label: 'Qty', num: true }, { label: 'Unit price', num: true }, { label: 'Tax %', num: true }, { label: 'Amount', num: true }], i.lines.map((l) => [l.description, String(l.quantity), inr(l.unitPrice), String(l.taxRate), inr(l.total)]), ['Subtotal', '', '', '', inr(i.subtotal)])
      + kv([['Subtotal', inr(i.subtotal)], ['Tax', inr(i.taxTotal)], ['Discount', D(i.discount).gt(0) ? `− ${inr(i.discount)}` : '—'], ['Total', inr(i.total)], ['Paid to date', inr(i.amountPaid)], ['Balance due', inr(s.outstanding)]])
      + (i.notes ? `<h2>Notes</h2><p>${i.notes.replace(/[<>&]/g, '')}</p>` : '') + '<p class="muted">Payments are accepted by bank transfer or UPI. This invoice was issued by The Royal Knot.</p>');
    return new StreamableFile(await this.pdf.htmlToPdf(html), { type: 'application/pdf', disposition: `inline; filename="${i.invoiceNo}.pdf"` });
  }
}
