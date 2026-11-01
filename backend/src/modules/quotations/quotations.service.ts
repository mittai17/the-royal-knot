import { BadRequestException, ConflictException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { Prisma, QuotationStatus, VendorCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUser } from '../../common/decorators';
import { computeQuotation, D, rankQuotations } from '../../common/finance';
import { PdfService } from '../../common/pdf.service';
import { dt, inr, kv, page, table } from '../../common/pdf-templates';
import { PrismaService } from '../../database/prisma.service';
import { AGREEMENT_NOT_SIGNED, isAgreementSigned } from '../../common/agreement-gate';
import { ScopeService } from '../../common/scope.service';
import { assertTransition, canTransition, QUOTATION_EXPIRABLE, QUOTATION_TRANSITIONS } from '../../common/state-machines';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRfqDto, RfqQuery, SelectQuotationDto, SubmitQuotationDto } from './quotations.dto';

const qInclude = { items: true, request: { include: { vendor: true } } } satisfies Prisma.QuotationInclude;

@Injectable()
export class QuotationsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private pdf: PdfService, private scope: ScopeService) {}

  async createRfq(dto: CreateRfqDto, actor: AuthUser) {
    const vendors = (await this.prisma.vendor.findMany({ where: { id: { in: dto.vendorIds }, active: true } })).sort((x, y) => dto.vendorIds.indexOf(x.id) - dto.vendorIds.indexOf(y.id)); // keep the caller's invitation order (heap order is arbitrary)
    if (vendors.length !== new Set(dto.vendorIds).size) throw new BadRequestException('One or more vendors not found');
    const wrong = vendors.filter((v) => v.category !== dto.category);
    if (wrong.length) throw new BadRequestException(`Vendors not in category ${dto.category}: ${wrong.map((v) => v.name).join(', ')}`);
    const wedding = await this.prisma.wedding.findUnique({ where: { id: dto.weddingId } });
    if (!wedding) throw new NotFoundException('Wedding not found');
    await this.scope.assertWeddingAccess(actor, dto.weddingId);
    // Procurement sequence (decision 4): RFQs go out only after the agreement is SIGNED. Staff may prepare them earlier (DRAFT, invisible to vendors).
    const signed = await isAgreementSigned(this.prisma, dto.weddingId);
    const rfqGroup = randomUUID();
    await this.prisma.quotationRequest.createMany({ data: vendors.map((v) => ({ rfqGroup, weddingId: dto.weddingId, vendorId: v.id, category: dto.category, title: dto.title, brief: dto.brief, status: signed ? QuotationStatus.SENT : QuotationStatus.DRAFT })) });
    await this.audit.log({ actorId: actor.id, weddingId: dto.weddingId, entity: 'QuotationRequest', entityId: rfqGroup, action: signed ? 'rfq.create' : 'rfq.prepare', message: `${signed ? 'Requested' : 'Prepared (not sent: agreement unsigned)'} ${dto.category.toLowerCase()} quotations from ${vendors.map((v) => v.name).join(', ')}` });
    return this.group(rfqGroup);
  }

  /** Sends a prepared (DRAFT) RFQ round to its vendors. 409 AGREEMENT_NOT_SIGNED until the wedding's agreement is SIGNED. Idempotent per vendor row. */
  async sendRfq(rfqGroup: string, actor: AuthUser) {
    const rows = await this.prisma.quotationRequest.findMany({ where: { rfqGroup }, select: { id: true, weddingId: true, status: true } });
    if (!rows.length) throw new NotFoundException('Quotation request not found');
    await this.scope.assertWeddingAccess(actor, rows[0].weddingId);
    if (!(await isAgreementSigned(this.prisma, rows[0].weddingId))) throw new ConflictException({ message: 'RFQs can only be sent after the service agreement is signed', code: AGREEMENT_NOT_SIGNED });
    const drafts = rows.filter((r) => r.status === 'DRAFT');
    if (!drafts.length) {
      if (rows.some((r) => r.status === 'SENT' || r.status === 'RECEIVED')) return this.group(rfqGroup); // already out
      assertTransition('RFQ', QUOTATION_TRANSITIONS, rows[0].status, 'SENT');
    }
    await this.prisma.quotationRequest.updateMany({ where: { rfqGroup, status: 'DRAFT' }, data: { status: 'SENT' } });
    await this.audit.log({ actorId: actor.id, weddingId: rows[0].weddingId, entity: 'QuotationRequest', entityId: rfqGroup, action: 'rfq.send', message: `Sent ${drafts.length} RFQ(s) to vendors` });
    return this.group(rfqGroup);
  }

  private async group(rfqGroup: string) {
    const requests = await this.prisma.quotationRequest.findMany({ where: { rfqGroup }, include: { vendor: true, quotation: { include: { items: true } } }, orderBy: { createdAt: 'asc' } });
    if (!requests.length) throw new NotFoundException('Quotation request not found');
    return { rfqGroup, weddingId: requests[0].weddingId, category: requests[0].category, title: requests[0].title, brief: requests[0].brief, createdAt: requests[0].createdAt, decided: requests.some((r) => r.status === 'SELECTED'), requests };
  }

  /** List of RFQ groups (one row per sourcing round). */
  async listGroups(q: RfqQuery, user?: AuthUser) {
    if (user && q.weddingId) await this.scope.assertWeddingAccess(user, q.weddingId);
    const rows = await this.prisma.quotationRequest.findMany({
      where: { ...(user && this.scope.isScoped(user) ? { wedding: this.scope.weddingWhere(user) } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.category ? { category: q.category } : {}), ...(q.status ? { status: q.status } : {}) },
      include: { vendor: { select: { id: true, name: true } }, wedding: { select: { id: true, name: true } }, quotation: { select: { id: true, grandTotal: true, status: true } } }, orderBy: { createdAt: 'desc' },
    });
    const groups = new Map<string, typeof rows>();
    rows.forEach((r) => groups.set(r.rfqGroup, [...(groups.get(r.rfqGroup) ?? []), r]));
    return [...groups.entries()].map(([rfqGroup, rs]) => ({
      rfqGroup, weddingId: rs[0].weddingId, wedding: rs[0].wedding, category: rs[0].category, title: rs[0].title, createdAt: rs[0].createdAt,
      invited: rs.length, received: rs.filter((r) => r.quotation).length, decided: rs.some((r) => r.status === 'SELECTED'),
      status: rs.some((r) => r.status === 'SELECTED') ? 'DECIDED' : rs.every((r) => r.quotation) ? 'READY_TO_COMPARE' : 'AWAITING_QUOTES',
      requests: rs.map((r) => ({ id: r.id, vendor: r.vendor, status: r.status, quotationId: r.quotation?.id ?? null, grandTotal: r.quotation?.grandTotal ?? null })),
    }));
  }

  async getRequest(id: string, user?: AuthUser) {
    const r = await this.prisma.quotationRequest.findUnique({ where: { id }, include: { vendor: true, wedding: { select: { id: true, name: true, expectedGuests: true } }, quotation: { include: { items: true } } } });
    if (!r) throw new NotFoundException('Quotation request not found');
    if (user) await this.scope.assertWeddingAccess(user, r.weddingId); // IDOR
    return r;
  }

  /** Enter (or revise) a vendor's quote. Totals are always recomputed server-side from the line items. */
  async submit(requestId: string, dto: SubmitQuotationDto, actor: AuthUser) {
    const req = await this.getRequest(requestId, actor.role === 'VENDOR' ? undefined : actor);
    if (req.status === 'DRAFT') throw new ConflictException({ message: 'This RFQ has not been sent to vendors yet (the agreement must be signed first)', code: AGREEMENT_NOT_SIGNED });
    if (req.status !== 'SENT' && req.status !== 'RECEIVED') throw new ConflictException(`This request is ${req.status.toLowerCase().replace('_', ' ')} and no longer accepts quotations`);
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
      assertTransition('RFQ', QUOTATION_TRANSITIONS, req.status, 'RECEIVED', { allowSame: true });
      await tx.quotationRequest.update({ where: { id: requestId }, data: { status: 'RECEIVED' } });
      await this.audit.log({ actorId: actor.id, weddingId: req.weddingId, entity: 'Quotation', entityId: quote.id, action: 'submit', message: `Quotation from ${req.vendor.name}: ${inr(calc.grandTotal)}` }, tx);
      return quote;
    });
    await this.notif.notify({ type: 'quotation.received', title: 'Quotation received', body: `${req.vendor.name} · ${inr(calc.grandTotal)} (${req.category.toLowerCase()})`, link: `/quotations?rfq=${req.rfqGroup}`, roles: ['PLANNER'] });
    return q;
  }

  /** Side-by-side comparison for an RFQ group (latest round for the wedding/category by default). */
  async comparison(weddingId: string, category?: VendorCategory, rfqGroup?: string, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    const latest = rfqGroup ? { rfqGroup } : await this.prisma.quotationRequest.findFirst({ where: { weddingId, ...(category ? { category } : {}) }, orderBy: { createdAt: 'desc' }, select: { rfqGroup: true } });
    const groups = await this.listGroups({ weddingId, category } as RfqQuery);
    if (!latest) return { rfqGroup: null, groups, quotations: [], pending: [] };
    const g = await this.group(latest.rfqGroup);
    if (g.weddingId !== weddingId) throw new NotFoundException('Quotation request not found'); // an rfqGroup of another wedding is not readable through this wedding
    const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id: g.weddingId } });
    const clientPick = await this.clientSelection(g.rfqGroup);
    const quotes = g.requests.filter((r) => r.quotation).map((r) => {
      const q = r.quotation!;
      const included = q.items.filter((i) => i.included);
      return { requestId: r.id, quotationId: q.id, requestStatus: r.status, status: q.status, vendor: { id: r.vendor.id, name: r.vendor.name, rating: Number(r.vendor.rating), contactName: r.vendor.contactName, phone: r.vendor.phone }, menu: q.menu, guests: q.guests, guestCapacity: q.guestCapacity, ratePerPlate: q.ratePerPlate, extraHourCharge: q.extraHourCharge, subtotal: q.subtotal, taxTotal: q.taxTotal, additionalTotal: q.additionalTotal, grandTotal: q.grandTotal, pricePerPlate: q.pricePerPlate, notes: q.notes, validUntil: q.validUntil, decisionNote: q.decisionNote, items: q.items, includedCount: included.length, excludedCount: q.items.length - included.length, capacityOk: !q.guestCapacity || q.guestCapacity >= w.expectedGuests };
    });
    const rank = rankQuotations(quotes.map((q) => ({ id: q.quotationId, grandTotal: q.grandTotal, rating: q.vendor.rating, includedCount: q.includedCount, totalCount: q.items.length, capacityOk: q.capacityOk })));
    return {
      rfqGroup: g.rfqGroup, weddingId, category: g.category, title: g.title, brief: g.brief, decided: g.decided, expectedGuests: w.expectedGuests, groups, clientSelection: clientPick,
      quotations: quotes.map((q) => ({ ...q, flags: { lowest: q.quotationId === rank.lowestId, bestValue: q.quotationId === rank.bestValueId, recommended: q.quotationId === rank.recommendedId }, score: rank.scores[q.quotationId] })),
      pending: g.requests.filter((r) => !r.quotation).map((r) => ({ requestId: r.id, vendor: { id: r.vendor.id, name: r.vendor.name }, status: r.status })),
      scoring: { lowest: 'Lowest grand total.', bestValue: 'Lowest cost per included service line among quotes that meet guest capacity.', recommended: 'Weighted score: price 40%, vendor rating 30%, inclusions 20%, capacity fit 10%. The cheapest quote is not automatically recommended.' },
    };
  }

  /** The couple's recorded vendor choice for an RFQ round (procurement sequence: comparison -> client selection -> selected vendor). */
  async clientSelection(rfqGroup: string) {
    const row = await this.prisma.activityLog.findFirst({ where: { entity: 'Quotation', action: 'client.select', meta: { path: ['rfqGroup'], equals: rfqGroup } }, orderBy: { createdAt: 'desc' } });
    if (!row) return null;
    const m = row.meta as { quotationId?: string; note?: string } | null;
    return { quotationId: m?.quotationId ?? row.entityId, note: m?.note ?? null, at: row.createdAt, byUserId: row.actorId };
  }

  /**
   * The couple records which quote they prefer (agreement must be signed). This is a recorded decision step, not the booking: the planner's
   * `select` still performs the atomic award. Setting `procurement.requireClientSelection` in SystemSetting makes the step mandatory.
   */
  async recordClientSelection(quotationId: string, note: string | undefined, actor: AuthUser) {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId }, include: { request: true } });
    if (!q) throw new NotFoundException('Quotation not found');
    await this.scope.assertWeddingAccess(actor, q.request.weddingId);
    if (!(await isAgreementSigned(this.prisma, q.request.weddingId))) throw new ConflictException({ message: 'Vendor selection opens once the agreement is signed', code: AGREEMENT_NOT_SIGNED });
    if (!['RECEIVED', 'UNDER_REVIEW', 'COMPARED'].includes(q.request.status) || !['RECEIVED', 'UNDER_REVIEW', 'COMPARED'].includes(q.status)) throw new ConflictException('This quotation is no longer open for selection');
    await this.audit.log({ actorId: actor.id, weddingId: q.request.weddingId, entity: 'Quotation', entityId: q.id, action: 'client.select', message: `Client preferred the ${q.request.category.toLowerCase()} quotation (${inr(q.grandTotal)})`, meta: { rfqGroup: q.request.rfqGroup, quotationId: q.id, requestId: q.request.id, note: note ?? null } });
    return { quotationId: q.id, rfqGroup: q.request.rfqGroup, recorded: true };
  }

  /** Planner moves a quotation through review: UNDER_REVIEW, COMPARED, REJECTED, CLOSED (SELECTED only via select()). Enforced by the transition table. */
  async setStatus(quotationId: string, to: QuotationStatus, actor: AuthUser) {
    if (to === 'SELECTED') throw new BadRequestException('Use the select action to award a quotation');
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId }, include: { request: true } });
    if (!q) throw new NotFoundException('Quotation not found');
    await this.scope.assertWeddingAccess(actor, q.request.weddingId);
    assertTransition('Quotation', QUOTATION_TRANSITIONS, q.status, to);
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.quotation.updateMany({ where: { id: quotationId, status: q.status }, data: { status: to } });
      if (!claim.count) throw new ConflictException('The quotation changed in the meantime');
      if (canTransition(QUOTATION_TRANSITIONS, q.request.status, to)) await tx.quotationRequest.update({ where: { id: q.request.id }, data: { status: to, ...(to === 'CLOSED' ? { closedAt: new Date() } : {}) } });
      await this.audit.log({ actorId: actor.id, weddingId: q.request.weddingId, entity: 'Quotation', entityId: quotationId, action: `status.${to.toLowerCase()}`, message: `Quotation ${q.status} → ${to}`, meta: { rfqGroup: q.request.rfqGroup, from: q.status, to } }, tx);
    });
    return this.prisma.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: qInclude });
  }

  /** Marks every received quote of an RFQ round as COMPARED (the comparison sheet was reviewed). */
  async markCompared(rfqGroup: string, actor: AuthUser) {
    const rows = await this.prisma.quotationRequest.findMany({ where: { rfqGroup }, select: { id: true, weddingId: true, status: true, quotation: { select: { id: true, status: true } } } });
    if (!rows.length) throw new NotFoundException('Quotation request not found');
    await this.scope.assertWeddingAccess(actor, rows[0].weddingId);
    const moving = rows.filter((r) => r.quotation && (r.status === 'RECEIVED' || r.status === 'UNDER_REVIEW') && (r.quotation.status === 'RECEIVED' || r.quotation.status === 'UNDER_REVIEW'));
    if (!moving.length) return { compared: 0 };
    await this.prisma.$transaction(async (tx) => {
      await tx.quotationRequest.updateMany({ where: { id: { in: moving.map((r) => r.id) }, status: { in: ['RECEIVED', 'UNDER_REVIEW'] } }, data: { status: 'COMPARED' } });
      await tx.quotation.updateMany({ where: { id: { in: moving.map((r) => r.quotation!.id) }, status: { in: ['RECEIVED', 'UNDER_REVIEW'] } }, data: { status: 'COMPARED' } });
      await this.audit.log({ actorId: actor.id, weddingId: rows[0].weddingId, entity: 'QuotationRequest', entityId: rfqGroup, action: 'compare', message: `Compared ${moving.length} quotation(s)`, meta: { rfqGroup } }, tx);
    });
    return { compared: moving.length };
  }

  /**
   * Job-safe expiry: quotations (and their RFQ rows) past `validUntil` become EXPIRED, but only from states the table allows
   * (never SELECTED / REJECTED / CLOSED), so re-running or racing with a selection cannot corrupt a decision.
   */
  async expireStale(now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const stale = await tx.quotation.findMany({ where: { status: { in: QUOTATION_EXPIRABLE }, validUntil: { lt: now } }, select: { id: true, requestId: true } });
      if (!stale.length) return { quotations: 0, requests: 0 };
      const q = await tx.quotation.updateMany({ where: { id: { in: stale.map((s) => s.id) }, status: { in: QUOTATION_EXPIRABLE } }, data: { status: 'EXPIRED' } });
      const r = await tx.quotationRequest.updateMany({ where: { id: { in: stale.map((s) => s.requestId) }, status: { in: QUOTATION_EXPIRABLE } }, data: { status: 'EXPIRED' } });
      return { quotations: q.count, requests: r.count };
    });
  }

  /**
   * Atomic decision: winner -> SELECTED, competing RFQs -> CLOSED (their quotes REJECTED) with a decision-history audit row per closed RFQ,
   * WeddingVendor upserted. A DB partial unique index (one SELECTED request per rfqGroup) backs this against concurrent selections.
   */
  async select(quotationId: string, dto: SelectQuotationDto, actor: AuthUser) {
    const preQ = await this.prisma.quotation.findUnique({ where: { id: quotationId }, select: { request: { select: { weddingId: true } } } });
    if (!preQ) throw new NotFoundException('Quotation not found');
    await this.scope.assertWeddingAccess(actor, preQ.request.weddingId);
    if (!(await isAgreementSigned(this.prisma, preQ.request.weddingId))) throw new ConflictException({ message: 'A vendor can only be selected after the service agreement is signed', code: AGREEMENT_NOT_SIGNED });
    const result = await this.prisma.$transaction(async (tx) => {
      const pre = await tx.quotation.findUnique({ where: { id: quotationId }, select: { request: { select: { rfqGroup: true } } } });
      if (!pre) throw new NotFoundException('Quotation not found');
      // Serialise every decision on this RFQ: concurrent selections queue here instead of deadlocking on each other's rows.
      await tx.$queryRaw`SELECT id FROM "QuotationRequest" WHERE "rfqGroup" = ${pre.request.rfqGroup} ORDER BY id FOR UPDATE`;
      const q = await tx.quotation.findUnique({ where: { id: quotationId }, include: qInclude });
      if (!q) throw new NotFoundException('Quotation not found');
      const req = q.request;
      const decided = await tx.quotationRequest.count({ where: { rfqGroup: req.rfqGroup, status: 'SELECTED' } });
      if (decided > 0) throw new ConflictException('A vendor has already been selected for this request');
      assertTransition('Quotation', QUOTATION_TRANSITIONS, q.status, 'SELECTED');
      if (q.validUntil && q.validUntil < new Date()) throw new ConflictException('This quotation has expired');
      const required = await tx.systemSetting.findUnique({ where: { key: 'procurement.requireClientSelection' } });
      const pick = await this.clientSelection(req.rfqGroup);
      if ((required?.value === true || (required?.value as { enabled?: boolean } | null)?.enabled === true) && pick?.quotationId !== q.id) throw new ConflictException({ message: 'The client must choose this vendor before it can be selected', code: 'CLIENT_SELECTION_REQUIRED' });
      const claim = await tx.quotationRequest.updateMany({ where: { id: req.id, status: { in: ['RECEIVED', 'UNDER_REVIEW', 'COMPARED'] } }, data: { status: 'SELECTED', closedAt: new Date() } });
      if (claim.count === 0) throw new ConflictException('A vendor has already been selected for this request, or the quote is not ready');
      const now = new Date();
      await tx.quotation.update({ where: { id: q.id }, data: { status: 'SELECTED', decisionNote: dto.note } });
      const siblings = await tx.quotationRequest.findMany({ where: { rfqGroup: req.rfqGroup, id: { not: req.id } }, include: { quotation: true, vendor: true } });
      for (const sib of siblings) {
        // decision history: one audit row per closed competing RFQ, whatever state it was in (DRAFT, SENT, RECEIVED, ...)
        if (sib.status !== 'CLOSED' && !canTransition(QUOTATION_TRANSITIONS, sib.status, 'CLOSED')) continue; // EXPIRED stays EXPIRED
        await tx.quotationRequest.update({ where: { id: sib.id }, data: { status: 'CLOSED', closedAt: now } });
        if (sib.quotation && canTransition(QUOTATION_TRANSITIONS, sib.quotation.status, 'REJECTED')) await tx.quotation.update({ where: { id: sib.quotation.id }, data: { status: 'REJECTED', decisionNote: `Not selected — ${req.vendor.name} chosen` } });
        await this.audit.log({ actorId: actor.id, weddingId: req.weddingId, entity: 'QuotationRequest', entityId: sib.id, action: 'rfq.close', message: `RFQ to ${sib.vendor.name} closed: ${req.vendor.name} selected`, meta: { rfqGroup: req.rfqGroup, previousStatus: sib.status, winnerQuotationId: q.id, total: sib.quotation?.grandTotal.toString() ?? null } }, tx);
      }
      const wv = await tx.weddingVendor.upsert({
        where: { weddingId_vendorId_category: { weddingId: req.weddingId, vendorId: req.vendorId, category: req.category } },
        create: { weddingId: req.weddingId, vendorId: req.vendorId, category: req.category, contractAmount: q.grandTotal, negotiatedAmount: q.grandTotal, quotationId: q.id },
        update: { contractAmount: q.grandTotal, negotiatedAmount: q.grandTotal, quotationId: q.id },
      });
      await tx.wedding.updateMany({ where: { id: req.weddingId, status: 'PLANNING', bookingStatus: { not: 'CANCELLED' } }, data: { status: 'VENDOR_BOOKING' } });
      await tx.wedding.updateMany({ where: { id: req.weddingId, executionStage: 'INITIAL_PHASE', bookingStatus: { not: 'CANCELLED' } }, data: { executionStage: 'VENDOR_BOOKING' } });
      await this.audit.log({ actorId: actor.id, weddingId: req.weddingId, entity: 'Quotation', entityId: q.id, action: 'select', message: `Selected ${req.vendor.name} (${inr(q.grandTotal)}) for ${req.category.toLowerCase()}; closed ${siblings.length} other request(s)`, meta: { rfqGroup: req.rfqGroup, note: dto.note ?? null, clientSelection: pick?.quotationId ?? null, clientSelectedThisVendor: pick?.quotationId === q.id, notSelected: siblings.map((s) => ({ vendor: s.vendor.name, total: s.quotation?.grandTotal.toString() ?? null })) } }, tx);
      return { quotationId: q.id, weddingVendorId: wv.id, vendor: req.vendor.name, weddingId: req.weddingId, category: req.category, closedRequests: siblings.length, grandTotal: q.grandTotal, clientSelectedThisVendor: pick?.quotationId === q.id };
    });
    await this.notif.notify({ type: 'vendor.selected', title: 'Vendor selected', body: `${result.vendor} · ${result.category.toLowerCase()} · ${inr(result.grandTotal)}`, link: `/weddings/${result.weddingId}`, roles: ['PLANNER', 'FINANCE'] });
    return result;
  }

  async renderPdf(quotationId: string, user?: AuthUser) {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId }, include: { items: true, request: { include: { vendor: true, wedding: true } } } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (user) await this.scope.assertWeddingAccess(user, q.request.weddingId);
    const html = page(`Quotation — ${q.request.vendor.name}`, `${q.request.wedding.name} · ${q.request.category}`, kv([['Vendor', q.request.vendor.name], ['Status', q.status], ['Valid until', dt(q.validUntil)], ...(q.menu ? [['Menu', q.menu] as [string, string]] : [])]) + table([{ label: 'Item' }, { label: 'Qty', num: true }, { label: 'Unit' }, { label: 'Unit price', num: true }, { label: 'Tax %', num: true }, { label: 'Line total', num: true }, { label: 'Included' }], q.items.map((i) => [i.name, String(i.quantity), i.unit, inr(i.unitPrice), String(i.taxRate), inr(i.total), i.included ? 'Yes' : 'Excluded']), ['Grand total', '', '', '', '', inr(q.grandTotal), '']) + kv([['Subtotal', inr(q.subtotal)], ['Taxes', inr(q.taxTotal)], ['Additional charges', inr(q.additionalTotal)], ['Price per plate', q.pricePerPlate ? inr(q.pricePerPlate) : '—']]));
    return new StreamableFile(await this.pdf.htmlToPdf(html), { type: 'application/pdf', disposition: 'inline; filename="quotation.pdf"' });
  }
}
