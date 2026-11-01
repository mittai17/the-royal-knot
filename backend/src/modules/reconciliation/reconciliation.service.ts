import { BadRequestException, ConflictException, Injectable, NotFoundException, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { clientBilling, clientReceived, D, extraGuestCharge, money, sum } from '../../common/finance';
import { syncMilestones } from '../../common/milestones';
import { PdfService } from '../../common/pdf.service';
import { inr, kv, page, table } from '../../common/pdf-templates';
import { vendorBill } from '../../common/vendor-bill';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorPaymentsService } from '../vendor-payments/vendor-payments.service';
import { CreateChargeDto, InvoiceDto, SettleDto, UpdateChargeDto } from './reconciliation.dto';

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService, private audit: AuditService, private pdf: PdfService, private vp: VendorPaymentsService) {}

  /** Creates the reconciliation shell, one settlement per vendor, and keeps the auto extra-guest charge in sync with actual attendance. */
  async ensure(weddingId: string, db: Prisma.TransactionClient | PrismaServiceLike = this.prisma) {
    const w = await db.wedding.findUnique({ where: { id: weddingId }, include: { weddingVendors: true } });
    if (!w) throw new NotFoundException('Wedding not found');
    const rec = await db.reconciliation.upsert({ where: { weddingId }, create: { weddingId }, update: {} });
    for (const wv of w.weddingVendors) {
      const q = wv.quotationId ? await db.quotation.findUnique({ where: { id: wv.quotationId } }) : null;
      await db.vendorSettlement.upsert({ where: { weddingVendorId: wv.id }, create: { reconciliationId: rec.id, weddingVendorId: wv.id, originalQuoted: q?.grandTotal ?? wv.contractAmount, negotiated: wv.negotiatedAmount ?? wv.contractAmount }, update: {} });
    }
    await this.syncExtraGuestCharge(weddingId, db);
    return rec;
  }

  /** actual − expected guests × contracted per-plate rate (e.g. 60 × ₹1,200 = ₹72,000). Approval state of an existing auto charge is preserved. */
  async syncExtraGuestCharge(weddingId: string, db: Prisma.TransactionClient | PrismaServiceLike = this.prisma) {
    const w = await db.wedding.findUnique({ where: { id: weddingId } });
    if (!w) return null;
    const rec = await db.reconciliation.upsert({ where: { weddingId }, create: { weddingId }, update: {} });
    const existing = await db.additionalCharge.findFirst({ where: { reconciliationId: rec.id, type: 'EXTRA_GUESTS', auto: true } });
    const caterer = await db.weddingVendor.findFirst({ where: { weddingId, category: 'CATERING' }, orderBy: { createdAt: 'asc' } });
    if (w.actualGuests == null || !caterer) return existing;
    const q = caterer.quotationId ? await db.quotation.findUnique({ where: { id: caterer.quotationId } }) : null;
    const rate = q?.ratePerPlate ?? q?.pricePerPlate;
    if (!rate) return existing;
    const { extraGuests, amount } = extraGuestCharge(w.expectedGuests, w.actualGuests, rate);
    if (extraGuests === 0) { if (existing && !existing.approved) await db.additionalCharge.delete({ where: { id: existing.id } }); return null; }
    const data = { quantity: extraGuests, unitPrice: rate, amount, description: `${extraGuests} extra guests (${w.actualGuests} actual vs ${w.expectedGuests} expected) × ${inr(rate)} per plate`, weddingVendorId: caterer.id };
    return existing
      ? db.additionalCharge.update({ where: { id: existing.id }, data })
      : db.additionalCharge.create({ data: { ...data, reconciliationId: rec.id, type: 'EXTRA_GUESTS', auto: true, approved: false, billToClient: true } });
  }

  async view(weddingId: string) {
    const rec = await this.ensure(weddingId);
    const [w, charges, settlements, payments] = await Promise.all([
      this.prisma.wedding.findUniqueOrThrow({ where: { id: weddingId }, include: { couple: true } }),
      this.prisma.additionalCharge.findMany({ where: { reconciliationId: rec.id }, orderBy: { createdAt: 'asc' }, include: { } }),
      this.prisma.vendorSettlement.findMany({ where: { reconciliationId: rec.id }, include: { weddingVendor: { include: { vendor: { select: { id: true, name: true } } } } } }),
      this.prisma.clientPayment.findMany({ where: { weddingId }, select: { amount: true, status: true, reversalOfId: true } }),
    ]);
    const vbills = await this.prisma.vendorBill.findMany({ where: { weddingId, status: { not: 'REJECTED' } }, select: { vendorId: true, total: true, amountPaid: true } });
    const vendors = await Promise.all(settlements.map(async (s) => {
      const b = await vendorBill(this.prisma, s.weddingVendorId);
      const mine = vbills.filter((x) => x.vendorId === s.weddingVendor.vendorId);
      return { billsTotal: money(sum(mine.map((x) => x.total))), billsPaid: money(sum(mine.map((x) => x.amountPaid))), billCount: mine.length, settlementId: s.id, weddingVendorId: s.weddingVendorId, vendor: s.weddingVendor.vendor, category: s.weddingVendor.category, status: s.status, settledAt: s.settledAt, invoiceRef: s.invoiceRef, actualInvoice: s.actualInvoice, originalQuoted: s.originalQuoted, ...b, wv: undefined, invoiceEntered: s.actualInvoice != null };
    }));
    const approvedClient = charges.filter((c) => c.approved && c.billToClient);
    const billing = clientBilling({ contractValue: w.contractValue, approvedExtras: sum(approvedClient.map((c) => c.amount)), received: clientReceived(payments) });
    return {
      reconciliationId: rec.id, status: rec.status, wedding: { id: w.id, name: w.name, expectedGuests: w.expectedGuests, actualGuests: w.actualGuests, extraGuests: Math.max(0, (w.actualGuests ?? w.expectedGuests) - w.expectedGuests) },
      charges: charges.map((c) => ({ ...c, vendorName: vendors.find((v) => v.weddingVendorId === c.weddingVendorId)?.vendor.name ?? null })),
      pendingChargesTotal: money(sum(charges.filter((c) => !c.approved).map((c) => c.amount))), vendors,
      clientBilling: billing,
      vendorTotals: { negotiated: money(sum(vendors.map((v) => v.negotiated))), finalBill: money(sum(vendors.map((v) => v.finalBill))), paid: money(sum(vendors.map((v) => v.paid))), remainingPayable: money(sum(vendors.map((v) => v.remainingPayable))) },
    };
  }

  async addCharge(weddingId: string, dto: CreateChargeDto, actor: AuthUser) {
    const rec = await this.ensure(weddingId);
    if (dto.weddingVendorId && !(await this.prisma.weddingVendor.findFirst({ where: { id: dto.weddingVendorId, weddingId } }))) throw new BadRequestException('Vendor is not assigned to this wedding');
    const c = await this.prisma.additionalCharge.create({ data: { reconciliationId: rec.id, weddingVendorId: dto.weddingVendorId, type: dto.type, description: dto.description, quantity: dto.quantity, unitPrice: dto.unitPrice, amount: money(D(dto.quantity).times(dto.unitPrice)), billToClient: dto.billToClient ?? true } });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'AdditionalCharge', entityId: c.id, action: 'create', message: `Added charge ${inr(c.amount)} — ${c.description}` });
    return c;
  }

  async updateCharge(id: string, dto: UpdateChargeDto, actor: AuthUser) {
    const c = await this.prisma.additionalCharge.findUnique({ where: { id }, include: { reconciliation: true } });
    if (!c) throw new NotFoundException('Charge not found');
    if (c.reconciliation.status === 'CLOSED') throw new ConflictException('Reconciliation is closed');
    const weddingId = c.reconciliation.weddingId;
    return this.prisma.$transaction(async (tx) => {
      const qty = dto.quantity ?? c.quantity, price = dto.unitPrice ?? c.unitPrice;
      const upd = await tx.additionalCharge.update({ where: { id }, data: { ...dto, ...(dto.quantity !== undefined || dto.unitPrice !== undefined ? { amount: money(D(qty).times(price)) } : {}) } });
      await this.resyncFinalMilestone(tx, weddingId);
      await this.audit.log({ actorId: actor.id, weddingId, entity: 'AdditionalCharge', entityId: id, action: dto.approved !== undefined ? (dto.approved ? 'approve' : 'unapprove') : 'update', message: `${dto.approved ? 'Approved' : 'Updated'} charge ${inr(upd.amount)} — ${upd.description}` }, tx);
      return upd;
    });
  }

  /**
   * Charges are never deleted. Voiding posts a negative counter-entry ("[VOID:<id>] ...") with the same approval state, so totals net to zero and
   * both rows stay in the history. Automatic charges follow the guest count instead.
   */
  async voidCharge(id: string, reason: string, actor: AuthUser) {
    const c = await this.prisma.additionalCharge.findUnique({ where: { id }, include: { reconciliation: true } });
    if (!c) throw new NotFoundException('Charge not found');
    if (c.auto) throw new BadRequestException('Automatic charges follow the guest count; adjust the actual guest count instead');
    if (c.description.startsWith('[VOID:')) throw new BadRequestException('This entry is already a void entry');
    if (c.reconciliation.status === 'CLOSED') throw new ConflictException('Reconciliation is closed');
    const weddingId = c.reconciliation.weddingId;
    const marker = `[VOID:${id}]`;
    const entry = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'void:' + id}))`;
      if (await tx.additionalCharge.findFirst({ where: { reconciliationId: c.reconciliationId, description: { startsWith: marker } } })) throw new ConflictException('This charge was already voided');
      const e = await tx.additionalCharge.create({ data: { reconciliationId: c.reconciliationId, weddingVendorId: c.weddingVendorId, type: c.type, description: `${marker} ${reason} (voids: ${c.description})`.slice(0, 500), quantity: c.quantity, unitPrice: c.unitPrice, amount: money(D(c.amount).neg()), approved: c.approved, billToClient: c.billToClient, auto: false } });
      await this.resyncFinalMilestone(tx, weddingId);
      await this.audit.log({ actorId: actor.id, weddingId, entity: 'AdditionalCharge', entityId: id, action: 'void', message: `Voided charge ${inr(c.amount)} — ${c.description} (${reason})`, meta: { voidEntryId: e.id, reason } }, tx);
      return e;
    });
    return { voided: c.id, entry };
  }

  /** "Update the final client billing": FINAL milestone absorbs approved client-billable extras. */
  private async resyncFinalMilestone(tx: Prisma.TransactionClient, weddingId: string) {
    const w = await tx.wedding.findUniqueOrThrow({ where: { id: weddingId } });
    const extras = await tx.additionalCharge.findMany({ where: { reconciliation: { weddingId }, approved: true, billToClient: true } });
    await syncMilestones(tx, w, w.contractValue, sum(extras.map((e) => e.amount)));
  }

  async setInvoice(settlementId: string, dto: InvoiceDto, actor: AuthUser) {
    const s = await this.prisma.vendorSettlement.findUnique({ where: { id: settlementId }, include: { reconciliation: true, weddingVendor: { include: { vendor: true } } } });
    if (!s) throw new NotFoundException('Settlement not found');
    if (s.status === 'SETTLED') throw new ConflictException('Vendor already settled');
    const u = await this.prisma.vendorSettlement.update({ where: { id: settlementId }, data: { actualInvoice: dto.actualInvoice, invoiceRef: dto.invoiceRef } });
    await this.audit.log({ actorId: actor.id, weddingId: s.reconciliation.weddingId, entity: 'VendorSettlement', entityId: settlementId, action: 'invoice', message: `Recorded final invoice ${inr(dto.actualInvoice)} from ${s.weddingVendor.vendor.name}` });
    return u;
  }

  /**
   * Pays the remaining payable (final bill − everything already paid) per vendor. Each vendor row is locked,
   * the remainder is recomputed inside the lock and the payment key is unique, so repeats cannot double-pay.
   */
  async settle(reconciliationId: string, dto: SettleDto, actor: AuthUser) {
    const rec = await this.prisma.reconciliation.findUnique({ where: { id: reconciliationId }, include: { settlements: true } });
    if (!rec) throw new NotFoundException('Reconciliation not found');
    const targets = rec.settlements.filter((s) => !dto.weddingVendorId || s.weddingVendorId === dto.weddingVendorId);
    if (!targets.length) throw new NotFoundException('No matching vendor settlement');
    const paid: { vendor: string; amount: Prisma.Decimal }[] = [];
    for (const s of targets) {
      const key = `${dto.idempotencyKey}:${s.weddingVendorId}`;
      if (await this.prisma.vendorPayment.findUnique({ where: { idempotencyKey: key } })) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "WeddingVendor" WHERE id = ${s.weddingVendorId} FOR UPDATE`;
          const fresh = await tx.vendorSettlement.findUniqueOrThrow({ where: { id: s.id } });
          if (fresh.actualInvoice == null) { if (dto.weddingVendorId) throw new UnprocessableEntityException('Enter the vendor\'s final invoice before settling'); return; }
          const b = await vendorBill(tx, s.weddingVendorId);
          if (D(b.remainingPayable).lte(0)) { if (dto.weddingVendorId) throw new ConflictException('Nothing payable — vendor is already fully paid'); await tx.vendorSettlement.update({ where: { id: s.id }, data: { status: 'SETTLED', settledAt: fresh.settledAt ?? new Date() } }); return; }
          await this.vp.postDirect(tx, { weddingId: rec.weddingId, weddingVendorId: s.weddingVendorId, kind: 'FINAL', amount: b.remainingPayable, method: dto.method, reference: dto.reference, idempotencyKey: key, paidAt: new Date(), notes: 'Final settlement' }, actor);
          await tx.vendorSettlement.update({ where: { id: s.id }, data: { status: 'SETTLED', settledAt: new Date() } });
          paid.push({ vendor: b.wv.vendor.name, amount: b.remainingPayable });
          await this.audit.log({ actorId: actor.id, weddingId: rec.weddingId, entity: 'VendorSettlement', entityId: s.id, action: 'settle', message: `Settled ${b.wv.vendor.name}: paid ${inr(b.remainingPayable)} (final bill ${inr(b.finalBill)})`, meta: { reference: dto.reference ?? null } }, tx);
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    const open = await this.prisma.vendorSettlement.count({ where: { reconciliationId, status: { not: 'SETTLED' } } });
    if (open === 0) await this.prisma.reconciliation.update({ where: { id: reconciliationId }, data: { status: 'CLOSED', closedAt: new Date() } });
    return { paid, totalPaid: sum(paid.map((p) => p.amount)), reconciliationClosed: open === 0 };
  }

  async statementPdf(weddingId: string) {
    const v = await this.view(weddingId);
    const html = page('Financial Reconciliation Statement', v.wedding.name, kv([['Expected guests', v.wedding.expectedGuests], ['Actual guests', v.wedding.actualGuests ?? 'Not recorded'], ['Extra guests', v.wedding.extraGuests]]) +
      '<h2>Client billing</h2>' + kv([['Original agreement', inr(v.clientBilling.original)], ['Approved additional charges', inr(v.clientBilling.approvedExtras)], ['Final amount', inr(v.clientBilling.finalAmount)], ['Amount received', inr(v.clientBilling.received)], ['Outstanding balance', inr(v.clientBilling.outstanding)]]) +
      '<h2>Additional charges</h2>' + table([{ label: 'Description' }, { label: 'Qty', num: true }, { label: 'Rate', num: true }, { label: 'Amount', num: true }, { label: 'Approved' }], v.charges.map((c) => [c.description, String(c.quantity), inr(c.unitPrice), inr(c.amount), c.approved ? 'Yes' : 'Pending'])) +
      '<h2>Vendor settlement</h2>' + table([{ label: 'Vendor' }, { label: 'Original', num: true }, { label: 'Negotiated', num: true }, { label: 'Advance', num: true }, { label: 'Extras', num: true }, { label: 'Final bill', num: true }, { label: 'Paid', num: true }, { label: 'Remaining', num: true }], v.vendors.map((x) => [x.vendor.name, inr(x.original), inr(x.negotiated), inr(x.advance), inr(x.approvedExtras), inr(x.finalBill), inr(x.paid), inr(x.remainingPayable)]), ['Total', '', inr(v.vendorTotals.negotiated), '', '', inr(v.vendorTotals.finalBill), inr(v.vendorTotals.paid), inr(v.vendorTotals.remainingPayable)]));
    return new StreamableFile(await this.pdf.htmlToPdf(html), { type: 'application/pdf', disposition: 'inline; filename="reconciliation.pdf"' });
  }
}

type PrismaServiceLike = PrismaService;
