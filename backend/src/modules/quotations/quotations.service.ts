import { BadRequestException, ConflictException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { Prisma, VendorCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUser } from '../../common/decorators';
import { computeQuotation, D, rankQuotations } from '../../common/finance';
import { PdfService } from '../../common/pdf.service';
import { dt, inr, kv, page, table } from '../../common/pdf-templates';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRfqDto, RfqQuery, SelectQuotationDto, SubmitQuotationDto } from './quotations.dto';

const qInclude = { items: true, request: { include: { vendor: true } } } satisfies Prisma.QuotationInclude;

@Injectable()
export class QuotationsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private pdf: PdfService) {}

  async createRfq(dto: CreateRfqDto, actor: AuthUser) {
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: dto.vendorIds }, active: true } });
    if (vendors.length !== new Set(dto.vendorIds).size) throw new BadRequestException('One or more vendors not found');
    const wrong = vendors.filter((v) => v.category !== dto.category);
    if (wrong.length) throw new BadRequestException(`Vendors not in category ${dto.category}: ${wrong.map((v) => v.name).join(', ')}`);
    const wedding = await this.prisma.wedding.findUnique({ where: { id: dto.weddingId } });
    if (!wedding) throw new NotFoundException('Wedding not found');
    const rfqGroup = randomUUID();
    await this.prisma.quotationRequest.createMany({ data: vendors.map((v) => ({ rfqGroup, weddingId: dto.weddingId, vendorId: v.id, category: dto.category, title: dto.title, brief: dto.brief })) });
    await this.audit.log({ actorId: actor.id, weddingId: dto.weddingId, entity: 'QuotationRequest', entityId: rfqGroup, action: 'rfq.create', message: `Requested ${dto.category.toLowerCase()} quotations from ${vendors.map((v) => v.name).join(', ')}` });
    return this.group(rfqGroup);
  }

  private async group(rfqGroup: string) {
    const requests = await this.prisma.quotationRequest.findMany({ where: { rfqGroup }, include: { vendor: true, quotation: { include: { items: true } } }, orderBy: { createdAt: 'asc' } });
    if (!requests.length) throw new NotFoundException('Quotation request not found');
    return { rfqGroup, weddingId: requests[0].weddingId, category: requests[0].category, title: requests[0].title, brief: requests[0].brief, createdAt: requests[0].createdAt, decided: requests.some((r) => r.status === 'ACCEPTED'), requests };
  }

  /** List of RFQ groups (one row per sourcing round). */
  async listGroups(q: RfqQuery) {
    const rows = await this.prisma.quotationRequest.findMany({
      where: { ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.category ? { category: q.category } : {}), ...(q.status ? { status: q.status } : {}) },
      include: { vendor: { select: { id: true, name: true } }, wedding: { select: { id: true, name: true } }, quotation: { select: { id: true, grandTotal: true, status: true } } }, orderBy: { createdAt: 'desc' },
    });
    const groups = new Map<string, typeof rows>();
    rows.forEach((r) => groups.set(r.rfqGroup, [...(groups.get(r.rfqGroup) ?? []), r]));
    return [...groups.entries()].map(([rfqGroup, rs]) => ({
      rfqGroup, weddingId: rs[0].weddingId, wedding: rs[0].wedding, category: rs[0].category, title: rs[0].title, createdAt: rs[0].createdAt,
      invited: rs.length, received: rs.filter((r) => r.quotation).length, decided: rs.some((r) => r.status === 'ACCEPTED'),
      status: rs.some((r) => r.status === 'ACCEPTED') ? 'DECIDED' : rs.every((r) => r.quotation) ? 'READY_TO_COMPARE' : 'AWAITING_QUOTES',
      requests: rs.map((r) => ({ id: r.id, vendor: r.vendor, status: r.status, quotationId: r.quotation?.id ?? null, grandTotal: r.quotation?.grandTotal ?? null })),
    }));
  }

  async getRequest(id: string) {
    const r = await this.prisma.quotationRequest.findUnique({ where: { id }, include: { vendor: true, wedding: { select: { id: true, name: true, expectedGuests: true } }, quotation: { include: { items: true } } } });
    if (!r) throw new NotFoundException('Quotation request not found');
    return r;
  }

  /** Enter (or revise) a vendor's quote. Totals are always recomputed server-side from the line items. */
  async submit(requestId: string, dto: SubmitQuotationDto, actor: AuthUser) {
    const req = await this.getRequest(requestId);
    if (req.status === 'ACCEPTED' || req.status === 'NOT_SELECTED') throw new ConflictException('This request is closed');
    const guests = dto.guests ?? req.wedding.expectedGuests;
    const calc = computeQuotation(dto.items, req.category === 'CATERING' ? guests : null);
    const data = {
      menu: dto.menu, guests: req.category === 'CATERING' ? guests : dto.guests, guestCapacity: dto.guestCapacity, extraHourCharge: dto.extraHourCharge, rating: dto.rating, notes: dto.notes, validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      ratePerPlate: dto.ratePerPlate ?? (req.category === 'CATERING' ? dto.items.find((i) => /plate|menu|per head/i.test(`${i.unit} ${i.name}`))?.unitPrice : undefined),
      subtotal: calc.subtotal, taxTotal: calc.taxTotal, additionalTotal: calc.additionalTotal, grandTotal: calc.grandTotal, pricePerPlate: calc.pricePerPlate,
    };
    const items = dto.items.map((i, idx) => ({ name: i.name, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, taxRate: i.taxRate ?? 0, additionalCharge: i.additionalCharge ?? 0, included: i.included ?? true, total: calc.lines[idx].total }));
    const q = await this.prisma.$transaction(async (tx) => {
      if (req.quotation) await tx.quotationItem.deleteMany({ where: { quotationId: req.quotation.id } });
      const quote = req.quotation
        ? await tx.quotation.update({ where: { id: req.quotation.id }, data: { ...data, items: { create: items } }, include: qInclude })
        : await tx.quotation.create({ data: { requestId, ...data, items: { create: items } }, include: qInclude });
      await tx.quotationRequest.update({ where: { id: requestId }, data: { status: 'RECEIVED' } });
      await this.audit.log({ actorId: actor.id, weddingId: req.weddingId, entity: 'Quotation', entityId: quote.id, action: 'submit', message: `Quotation from ${req.vendor.name}: ${inr(calc.grandTotal)}` }, tx);
      return quote;
    });
    await this.notif.notify({ type: 'quotation.received', title: 'Quotation received', body: `${req.vendor.name} · ${inr(calc.grandTotal)} (${req.category.toLowerCase()})`, link: `/quotations?rfq=${req.rfqGroup}`, roles: ['PLANNER'] });
    return q;
  }

  /** Side-by-side comparison for an RFQ group (latest round for the wedding/category by default). */
  async comparison(weddingId: string, category?: VendorCategory, rfqGroup?: string) {
    const latest = rfqGroup ? { rfqGroup } : await this.prisma.quotationRequest.findFirst({ where: { weddingId, ...(category ? { category } : {}) }, orderBy: { createdAt: 'desc' }, select: { rfqGroup: true } });
    const groups = await this.listGroups({ weddingId, category } as RfqQuery);
    if (!latest) return { rfqGroup: null, groups, quotations: [], pending: [] };
    const g = await this.group(latest.rfqGroup);
    const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id: g.weddingId } });
    const quotes = g.requests.filter((r) => r.quotation).map((r) => {
      const q = r.quotation!;
      const included = q.items.filter((i) => i.included);
      return { requestId: r.id, quotationId: q.id, requestStatus: r.status, status: q.status, vendor: { id: r.vendor.id, name: r.vendor.name, rating: Number(r.vendor.rating), contactName: r.vendor.contactName, phone: r.vendor.phone }, menu: q.menu, guests: q.guests, guestCapacity: q.guestCapacity, ratePerPlate: q.ratePerPlate, extraHourCharge: q.extraHourCharge, subtotal: q.subtotal, taxTotal: q.taxTotal, additionalTotal: q.additionalTotal, grandTotal: q.grandTotal, pricePerPlate: q.pricePerPlate, notes: q.notes, validUntil: q.validUntil, decisionNote: q.decisionNote, items: q.items, includedCount: included.length, excludedCount: q.items.length - included.length, capacityOk: !q.guestCapacity || q.guestCapacity >= w.expectedGuests };
    });
    const rank = rankQuotations(quotes.map((q) => ({ id: q.quotationId, grandTotal: q.grandTotal, rating: q.vendor.rating, includedCount: q.includedCount, totalCount: q.items.length, capacityOk: q.capacityOk })));
    return {
      rfqGroup: g.rfqGroup, weddingId, category: g.category, title: g.title, brief: g.brief, decided: g.decided, expectedGuests: w.expectedGuests, groups,
      quotations: quotes.map((q) => ({ ...q, flags: { lowest: q.quotationId === rank.lowestId, bestValue: q.quotationId === rank.bestValueId, recommended: q.quotationId === rank.recommendedId }, score: rank.scores[q.quotationId] })),
      pending: g.requests.filter((r) => !r.quotation).map((r) => ({ requestId: r.id, vendor: { id: r.vendor.id, name: r.vendor.name }, status: r.status })),
      scoring: { lowest: 'Lowest grand total.', bestValue: 'Lowest cost per included service line among quotes that meet guest capacity.', recommended: 'Weighted score: price 40%, vendor rating 30%, inclusions 20%, capacity fit 10%. The cheapest quote is not automatically recommended.' },
    };
  }

  /**
   * Atomic decision: winner → ACCEPTED, siblings → NOT_SELECTED (quotes REJECTED), WeddingVendor upserted.
   * A DB partial unique index (one ACCEPTED request per rfqGroup) backs this against concurrent selections.
   */
  async select(quotationId: string, dto: SelectQuotationDto, actor: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const pre = await tx.quotation.findUnique({ where: { id: quotationId }, select: { request: { select: { rfqGroup: true } } } });
      if (!pre) throw new NotFoundException('Quotation not found');
      // Serialise every decision on this RFQ: concurrent selections queue here instead of deadlocking on each other's rows.
      await tx.$queryRaw`SELECT id FROM "QuotationRequest" WHERE "rfqGroup" = ${pre.request.rfqGroup} ORDER BY id FOR UPDATE`;
      const q = await tx.quotation.findUnique({ where: { id: quotationId }, include: qInclude });
      if (!q) throw new NotFoundException('Quotation not found');
      const req = q.request;
      const decided = await tx.quotationRequest.count({ where: { rfqGroup: req.rfqGroup, status: 'ACCEPTED' } });
      if (decided > 0) throw new ConflictException('A vendor has already been selected for this request');
      const claim = await tx.quotationRequest.updateMany({ where: { id: req.id, status: 'RECEIVED' }, data: { status: 'ACCEPTED', closedAt: new Date() } });
      if (claim.count === 0) throw new ConflictException('A vendor has already been selected for this request, or the quote is not ready');
      const now = new Date();
      await tx.quotation.update({ where: { id: q.id }, data: { status: 'ACCEPTED', decisionNote: dto.note } });
      const siblings = await tx.quotationRequest.findMany({ where: { rfqGroup: req.rfqGroup, id: { not: req.id } }, include: { quotation: true, vendor: true } });
      await tx.quotationRequest.updateMany({ where: { rfqGroup: req.rfqGroup, id: { not: req.id } }, data: { status: 'NOT_SELECTED', closedAt: now } });
      await tx.quotation.updateMany({ where: { request: { rfqGroup: req.rfqGroup, id: { not: req.id } } }, data: { status: 'REJECTED', decisionNote: `Not selected — ${req.vendor.name} chosen` } });
      const wv = await tx.weddingVendor.upsert({
        where: { weddingId_vendorId_category: { weddingId: req.weddingId, vendorId: req.vendorId, category: req.category } },
        create: { weddingId: req.weddingId, vendorId: req.vendorId, category: req.category, contractAmount: q.grandTotal, negotiatedAmount: q.grandTotal, quotationId: q.id },
        update: { contractAmount: q.grandTotal, negotiatedAmount: q.grandTotal, quotationId: q.id },
      });
      await tx.wedding.updateMany({ where: { id: req.weddingId, status: 'PLANNING' }, data: { status: 'VENDOR_BOOKING' } });
      await this.audit.log({ actorId: actor.id, weddingId: req.weddingId, entity: 'Quotation', entityId: q.id, action: 'select', message: `Selected ${req.vendor.name} (${inr(q.grandTotal)}) for ${req.category.toLowerCase()}; closed ${siblings.length} other request(s)`, meta: { rfqGroup: req.rfqGroup, note: dto.note ?? null, notSelected: siblings.map((s) => ({ vendor: s.vendor.name, total: s.quotation?.grandTotal.toString() ?? null })) } }, tx);
      return { quotationId: q.id, weddingVendorId: wv.id, vendor: req.vendor.name, weddingId: req.weddingId, category: req.category, closedRequests: siblings.length, grandTotal: q.grandTotal };
    });
    await this.notif.notify({ type: 'vendor.selected', title: 'Vendor selected', body: `${result.vendor} · ${result.category.toLowerCase()} · ${inr(result.grandTotal)}`, link: `/weddings/${result.weddingId}`, roles: ['PLANNER', 'FINANCE'] });
    return result;
  }

  async renderPdf(quotationId: string) {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId }, include: { items: true, request: { include: { vendor: true, wedding: true } } } });
    if (!q) throw new NotFoundException('Quotation not found');
    const html = page(`Quotation — ${q.request.vendor.name}`, `${q.request.wedding.name} · ${q.request.category}`, kv([['Vendor', q.request.vendor.name], ['Status', q.status], ['Valid until', dt(q.validUntil)], ...(q.menu ? [['Menu', q.menu] as [string, string]] : [])]) + table([{ label: 'Item' }, { label: 'Qty', num: true }, { label: 'Unit' }, { label: 'Unit price', num: true }, { label: 'Tax %', num: true }, { label: 'Line total', num: true }, { label: 'Included' }], q.items.map((i) => [i.name, String(i.quantity), i.unit, inr(i.unitPrice), String(i.taxRate), inr(i.total), i.included ? 'Yes' : 'Excluded']), ['Grand total', '', '', '', '', inr(q.grandTotal), '']) + kv([['Subtotal', inr(q.subtotal)], ['Taxes', inr(q.taxTotal)], ['Additional charges', inr(q.additionalTotal)], ['Price per plate', q.pricePerPlate ? inr(q.pricePerPlate) : '—']]));
    return new StreamableFile(await this.pdf.htmlToPdf(html), { type: 'application/pdf', disposition: 'inline; filename="quotation.pdf"' });
  }
}
