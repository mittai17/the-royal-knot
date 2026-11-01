import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { vendorBill } from '../../common/vendor-bill';
import { ScopeService } from '../../common/scope.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QuotationsService } from '../quotations/quotations.service';
import { TasksService } from '../tasks/tasks.service';
import { AvailabilityDto, PortalQuotationDto, RfqListQuery, ServiceDto, UpdateServiceDto, UpdateVendorProfileDto, VENDOR_DOC_CATEGORIES, VendorTaskDto } from './portal-vendor.dto';
import { DocumentCategory } from '@prisma/client';

const ist = (d: Date) => new Date(d.getTime() + 19_800_000).toISOString().slice(0, 10);
const DAY = 864e5;
const wedBrief = { id: true, name: true, location: true, venue: true, startDate: true, endDate: true, expectedGuests: true, status: true } satisfies Prisma.WeddingSelect;

/** Vendor-portal RFQ state labels (stable API view-model) derived from the canonical QuotationStatus. */
const rfqState = (s: string) => (s === 'SENT' ? 'NEW' : s === 'RECEIVED' ? 'SUBMITTED' : s === 'SELECTED' ? 'ACCEPTED' : s === 'CLOSED' ? 'NOT_SELECTED' : s);

@Injectable()
export class PortalVendorService {
  constructor(
    private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private quotations: QuotationsService, private events: EventsService,
    private tasks: TasksService, private docs: DocumentsService, private notif: NotificationsService,
  ) {}

  private vid(u: AuthUser) { return this.scope.requireVendorId(u); }
  private async ownBooking(u: AuthUser, id: string) {
    const wv = await this.prisma.weddingVendor.findUnique({ where: { id }, include: { wedding: { select: wedBrief }, arrival: true, vendor: { select: { name: true } } } });
    // 404 (not 403) so ids of other vendors' bookings cannot be probed
    if (!wv || wv.vendorId !== this.vid(u)) throw new NotFoundException('Booking not found');
    return wv;
  }
  private async ownRequest(u: AuthUser, id: string) {
    const r = await this.prisma.quotationRequest.findUnique({ where: { id }, include: { wedding: { select: wedBrief }, quotation: { include: { items: true } } } });
    // 404 (not 403) so a vendor cannot probe for other vendors' RFQ ids
    if (!r || r.vendorId !== this.vid(u) || r.status === 'DRAFT') throw new NotFoundException('RFQ not found');
    return r;
  }

  // ---- dashboard ----
  async dashboard(u: AuthUser) {
    const vendorId = this.vid(u);
    const now = new Date();
    const [vendor, bookings, newRfqs, quoteGroups, upcomingEvents, reviews, nextBookings] = await Promise.all([
      this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true, name: true, businessName: true, category: true, rating: true, available: true } }),
      this.prisma.weddingVendor.findMany({ where: { vendorId, wedding: { status: { not: 'CANCELLED' } } }, select: { id: true } }),
      this.prisma.quotationRequest.count({ where: { vendorId, status: 'SENT' } }),
      this.prisma.quotation.groupBy({ by: ['status'], where: { request: { vendorId } }, _count: true }),
      this.prisma.weddingEvent.count({ where: { date: { gte: now }, wedding: { weddingVendors: { some: { vendorId } }, status: { not: 'CANCELLED' } } } }),
      this.prisma.vendorReview.aggregate({ where: { vendorId }, _avg: { rating: true }, _count: true }),
      this.prisma.weddingVendor.findMany({ where: { vendorId, wedding: { endDate: { gte: now }, status: { not: 'CANCELLED' } } }, orderBy: { wedding: { startDate: 'asc' } }, take: 4, include: { wedding: { select: wedBrief } } }),
    ]);
    const bills = await Promise.all(bookings.map((b) => vendorBill(this.prisma, b.id)));
    const pending = bills.reduce((a, b) => a.plus(b.remainingPayable), new Prisma.Decimal(0));
    const q = (s: string) => quoteGroups.find((g) => g.status === s)?._count ?? 0;
    return {
      vendor, totalBookings: bookings.length, upcomingEvents, newRfqs,
      pendingPayments: { amount: pending, bookings: bills.filter((b) => b.remainingPayable.gt(0)).length },
      rating: { average: reviews._avg.rating ?? Number(vendor.rating), reviews: reviews._count, profileRating: vendor.rating },
      quotations: { submitted: q('RECEIVED'), accepted: q('SELECTED'), rejected: q('REJECTED') },
      nextBookings: nextBookings.map((b) => ({ id: b.id, category: b.category, wedding: b.wedding })),
    };
  }

  // ---- bookings & contracts ----
  async bookings(u: AuthUser) {
    const vendorId = this.vid(u);
    const wvs = await this.prisma.weddingVendor.findMany({ where: { vendorId }, orderBy: { wedding: { startDate: 'desc' } }, include: { wedding: { select: wedBrief }, arrival: { select: { status: true, expectedAt: true, actualAt: true } } } });
    return Promise.all(wvs.map(async (b) => {
      const bill = await vendorBill(this.prisma, b.id);
      return { id: b.id, category: b.category, wedding: b.wedding, contractAmount: b.contractAmount, negotiatedAmount: b.negotiatedAmount, notes: b.notes, arrival: b.arrival, billing: { finalBill: bill.finalBill, paid: bill.paid, remaining: bill.remainingPayable } };
    }));
  }

  async contracts(u: AuthUser) {
    const vendorId = this.vid(u);
    const wvs = await this.prisma.weddingVendor.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, include: { wedding: { select: wedBrief }, payments: { orderBy: { paidAt: 'desc' }, select: { id: true, kind: true, amount: true, paidAt: true, method: true } } } });
    const quotes = await this.prisma.quotation.findMany({ where: { id: { in: wvs.map((w) => w.quotationId).filter((x): x is string => !!x) } }, include: { items: true } });
    const docs = await this.documentsList(u, 'VENDOR_CONTRACT');
    return {
      contracts: wvs.map((w) => {
        const q = quotes.find((x) => x.id === w.quotationId) ?? null;
        return { id: w.id, category: w.category, wedding: w.wedding, contractAmount: w.contractAmount, negotiatedAmount: w.negotiatedAmount, signedOffAt: w.createdAt, quotation: q ? { id: q.id, grandTotal: q.grandTotal, subtotal: q.subtotal, taxTotal: q.taxTotal, menu: q.menu, notes: q.notes, validUntil: q.validUntil, items: q.items } : null, payments: w.payments };
      }),
      documents: docs,
    };
  }

  // ---- RFQs & quotations ----
  async rfqs(u: AuthUser, q: RfqListQuery) {
    const vendorId = this.vid(u);
    const view = q.view ?? 'all';
    const status = view === 'new' ? { status: 'SENT' as const } : view === 'submitted' ? { status: 'RECEIVED' as const } : view === 'closed' ? { status: { in: ['SELECTED', 'CLOSED'] as ('SELECTED' | 'CLOSED')[] } } : { status: { not: 'DRAFT' as const } }; // DRAFT RFQs are prepared but not yet sent: invisible to vendors
    const rows = await this.prisma.quotationRequest.findMany({ where: { vendorId, ...status }, orderBy: { createdAt: 'desc' }, include: { wedding: { select: wedBrief }, quotation: { select: { id: true, status: true, grandTotal: true, createdAt: true } } } });
    const counts = await this.prisma.quotationRequest.groupBy({ by: ['status'], where: { vendorId, status: { not: 'DRAFT' } }, _count: true });
    return {
      counts: { new: counts.find((c) => c.status === 'SENT')?._count ?? 0, submitted: counts.find((c) => c.status === 'RECEIVED')?._count ?? 0, closed: (counts.find((c) => c.status === 'SELECTED')?._count ?? 0) + (counts.find((c) => c.status === 'CLOSED')?._count ?? 0) },
      rfqs: rows.map((r) => ({ id: r.id, title: r.title, category: r.category, brief: r.brief, status: r.status, state: rfqState(r.status), createdAt: r.createdAt, wedding: r.wedding, quotation: r.quotation })),
    };
  }

  async rfq(u: AuthUser, id: string) {
    const r = await this.ownRequest(u, id);
    const events = await this.prisma.weddingEvent.findMany({ where: { weddingId: r.weddingId }, orderBy: { date: 'asc' }, select: { id: true, name: true, kind: true, date: true, venue: true, expectedGuests: true } });
    return {
      id: r.id, title: r.title, category: r.category, brief: r.brief, status: r.status, createdAt: r.createdAt, closedAt: r.closedAt,
      state: rfqState(r.status),
      canSubmit: r.status === 'SENT' || r.status === 'RECEIVED',
      wedding: r.wedding, events, quotation: r.quotation,
      requirements: { guests: r.wedding.expectedGuests, venue: r.wedding.venue, location: r.wedding.location, dates: { start: r.wedding.startDate, end: r.wedding.endDate }, brief: r.brief },
    };
  }

  /** One quotation per vendor per RFQ (DB unique on requestId): the first call creates it, later calls revise it until the RFQ is decided. */
  async submitQuotation(u: AuthUser, id: string, dto: PortalQuotationDto) {
    const r = await this.ownRequest(u, id);
    if (r.status !== 'SENT' && r.status !== 'RECEIVED') throw new ConflictException('This RFQ is closed');
    if (dto.validUntil && new Date(dto.validUntil).getTime() < Date.now() - DAY) throw new BadRequestException('Validity date must be in the future');
    dto.items.forEach((i, n) => { if (!i.name.trim()) throw new BadRequestException(`Line ${n + 1}: item name is required`); if (!i.unit.trim()) throw new BadRequestException(`Line ${n + 1}: unit is required`); });
    if (!dto.items.some((i) => i.included !== false && i.quantity * i.unitPrice > 0)) throw new BadRequestException('At least one included line must have a price');
    const q = await this.quotations.submit(id, { ...dto, rating: undefined }, u);
    await this.audit.log({ actorId: u.id, weddingId: r.weddingId, entity: 'Quotation', entityId: q.id, action: 'portal.submit', message: `Vendor portal: ${r.quotation ? 'revised' : 'submitted'} quotation (${q.grandTotal.toString()})` });
    return q;
  }

  async quotationList(u: AuthUser) {
    const vendorId = this.vid(u);
    const rows = await this.prisma.quotationRequest.findMany({ where: { vendorId, quotation: { isNot: null } }, orderBy: { createdAt: 'desc' }, include: { wedding: { select: { id: true, name: true } }, quotation: { include: { items: { select: { id: true } } } } } });
    const sibs = await this.prisma.quotationRequest.findMany({ where: { rfqGroup: { in: rows.map((r) => r.rfqGroup) } }, select: { rfqGroup: true, quotation: { select: { id: true } } } });
    const ready = new Set(rows.map((r) => r.rfqGroup).filter((g) => sibs.filter((s) => s.rfqGroup === g).every((s) => s.quotation)));
    const stage = (r: (typeof rows)[number]) => (r.quotation!.status === 'SELECTED' ? 'ACCEPTED' : r.quotation!.status === 'REJECTED' ? 'REJECTED' : ready.has(r.rfqGroup) ? 'UNDER_REVIEW' : 'SUBMITTED');
    const list = rows.map((r) => ({ id: r.quotation!.id, requestId: r.id, title: r.title, category: r.category, wedding: r.wedding, stage: stage(r), grandTotal: r.quotation!.grandTotal, lines: r.quotation!.items.length, validUntil: r.quotation!.validUntil, decisionNote: r.quotation!.decisionNote, submittedAt: r.quotation!.createdAt }));
    const summary = { SUBMITTED: 0, UNDER_REVIEW: 0, ACCEPTED: 0, REJECTED: 0 } as Record<string, number>;
    list.forEach((l) => { summary[l.stage]++; });
    return { summary, quotations: list };
  }

  async quotationPdf(u: AuthUser, id: string) {
    const q = await this.prisma.quotation.findUnique({ where: { id }, select: { request: { select: { vendorId: true } } } });
    if (!q || q.request.vendorId !== this.vid(u)) throw new NotFoundException('Quotation not found');
    return this.quotations.renderPdf(id);
  }

  // ---- schedule ----
  async schedule(u: AuthUser) {
    const vendorId = this.vid(u);
    const wvs = await this.prisma.weddingVendor.findMany({ where: { vendorId, wedding: { status: { not: 'CANCELLED' } } }, include: { wedding: { select: wedBrief }, arrival: { select: { status: true, expectedAt: true, actualAt: true } } } });
    const weddingIds = wvs.map((w) => w.weddingId);
    const [events, items] = await Promise.all([
      this.prisma.weddingEvent.findMany({ where: { weddingId: { in: weddingIds } }, orderBy: { date: 'asc' } }),
      this.prisma.timelineItem.findMany({ where: { weddingId: { in: weddingIds } }, orderBy: { scheduledAt: 'asc' }, select: { id: true, weddingId: true, title: true, scheduledAt: true, status: true, delayMinutes: true } }),
    ]);
    type Entry = { key: string; kind: 'EVENT' | 'RUN_SHEET' | 'ARRIVAL'; title: string; at: Date; weddingId: string; weddingName: string; venue?: string | null; status?: string; category: string };
    const entries: Entry[] = [];
    for (const w of wvs) {
      events.filter((e) => e.weddingId === w.weddingId).forEach((e) => entries.push({ key: `e-${e.id}`, kind: 'EVENT', title: e.name, at: e.date, weddingId: w.weddingId, weddingName: w.wedding.name, venue: e.venue ?? w.wedding.venue, category: w.category }));
      items.filter((i) => i.weddingId === w.weddingId).forEach((i) => entries.push({ key: `t-${i.id}`, kind: 'RUN_SHEET', title: i.title, at: i.scheduledAt, weddingId: w.weddingId, weddingName: w.wedding.name, status: i.status, category: w.category }));
      if (w.arrival) entries.push({ key: `a-${w.id}`, kind: 'ARRIVAL', title: `${w.category.toLowerCase().replace('_', ' ')} team arrival`, at: w.arrival.expectedAt, weddingId: w.weddingId, weddingName: w.wedding.name, status: w.arrival.status, category: w.category });
    }
    entries.sort((a, b) => a.at.getTime() - b.at.getTime());
    const days = new Map<string, Entry[]>();
    entries.forEach((e) => { const k = ist(e.at); days.set(k, [...(days.get(k) ?? []), e]); });
    return { days: [...days.entries()].map(([date, es]) => ({ date, entries: es })), weddings: wvs.map((w) => ({ bookingId: w.id, ...w.wedding, category: w.category })) };
  }

  // ---- deliverables (state kept in SystemSetting until a schema field exists; see docs/SCHEMA_REQUESTS.md) ----
  private delKey(wvId: string) { return `vendor.deliverables.${wvId}`; }
  private async deliverableItems(wv: { id: string; category: string; quotationId: string | null }) {
    const q = wv.quotationId ? await this.prisma.quotation.findUnique({ where: { id: wv.quotationId }, include: { items: { where: { included: true }, orderBy: { name: 'asc' } } } }) : null;
    const items = q?.items.length ? q.items.map((i) => ({ id: i.id, name: i.name, description: i.description, quantity: i.quantity, unit: i.unit })) : [{ id: 'contract', name: `Deliver contracted ${wv.category.toLowerCase().replace('_', ' ')} services`, description: null, quantity: null, unit: null }];
    return items;
  }

  async deliverables(u: AuthUser) {
    const vendorId = this.vid(u);
    const wvs = await this.prisma.weddingVendor.findMany({ where: { vendorId, wedding: { status: { not: 'CANCELLED' } } }, orderBy: { wedding: { startDate: 'asc' } }, include: { wedding: { select: wedBrief } } });
    const states = await this.prisma.systemSetting.findMany({ where: { key: { in: wvs.map((w) => this.delKey(w.id)) } } });
    return Promise.all(wvs.map(async (w) => {
      const st = (states.find((s) => s.key === this.delKey(w.id))?.value ?? {}) as Record<string, { done: boolean; at: string; note?: string }>;
      const items = (await this.deliverableItems(w)).map((i) => ({ ...i, done: !!st[i.id]?.done, doneAt: st[i.id]?.at ?? null, note: st[i.id]?.note ?? null }));
      return { bookingId: w.id, category: w.category, wedding: w.wedding, items, done: items.filter((i) => i.done).length, total: items.length };
    }));
  }

  async setDeliverable(u: AuthUser, bookingId: string, itemId: string, done: boolean, note?: string) {
    const wv = await this.ownBooking(u, bookingId);
    const items = await this.deliverableItems(wv);
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Deliverable not found');
    const key = this.delKey(bookingId);
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const st = { ...((row?.value ?? {}) as Record<string, unknown>), [itemId]: { done, at: new Date().toISOString(), note: note ?? null } };
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: st as Prisma.InputJsonValue, updatedById: u.id }, update: { value: st as Prisma.InputJsonValue, updatedById: u.id } });
    const doneCount = items.filter((i) => (st[i.id] as { done?: boolean } | undefined)?.done).length;
    await this.audit.log({ actorId: u.id, weddingId: wv.weddingId, entity: 'WeddingVendor', entityId: bookingId, action: done ? 'deliverable.done' : 'deliverable.reopen', message: `${wv.vendor.name}: "${item.name}" ${done ? 'delivered' : 'reopened'} (${doneCount}/${items.length})` });
    if (done && doneCount === items.length) {
      const w = await this.prisma.wedding.findUnique({ where: { id: wv.weddingId }, select: { plannerId: true, name: true } });
      await this.notif.notify({ type: 'vendor.deliverables', title: 'Vendor deliverables complete', body: `${wv.vendor.name} · ${w?.name}`, link: `/weddings/${wv.weddingId}`, userIds: w?.plannerId ? [w.plannerId] : [], roles: w?.plannerId ? [] : ['PLANNER'] });
    }
    return { bookingId, itemId, done, completed: doneCount, total: items.length };
  }

  // ---- event-day check-in / check-out (delegates to EventsService.setArrival, so the Command Centre updates live) ----
  async checkInBoard(u: AuthUser) {
    const vendorId = this.vid(u);
    const now = Date.now();
    const wvs = await this.prisma.weddingVendor.findMany({ where: { vendorId, wedding: { status: { not: 'CANCELLED' }, startDate: { lte: new Date(now + 7 * DAY) }, endDate: { gte: new Date(now - 2 * DAY) } } }, orderBy: { wedding: { startDate: 'asc' } }, include: { wedding: { select: wedBrief }, arrival: true } });
    return wvs.map((w) => ({ bookingId: w.id, category: w.category, wedding: w.wedding, arrival: w.arrival ? { status: w.arrival.status, expectedAt: w.arrival.expectedAt, actualAt: w.arrival.actualAt, delayMinutes: w.arrival.delayMinutes, notes: w.arrival.notes } : null, windowOpen: this.windowOpen(w.wedding) }));
  }
  private windowOpen(w: { startDate: Date; endDate: Date }) { const n = Date.now(); return n >= w.startDate.getTime() - DAY && n <= w.endDate.getTime() + DAY; }

  async checkIn(u: AuthUser, bookingId: string, notes?: string) {
    const wv = await this.ownBooking(u, bookingId);
    if (!this.windowOpen(wv.wedding)) throw new ConflictException('Check-in opens one day before the wedding starts');
    if (wv.arrival && ['ARRIVED', 'COMPLETED'].includes(wv.arrival.status)) throw new ConflictException(wv.arrival.status === 'COMPLETED' ? 'Already checked out' : 'Already checked in');
    return this.events.setArrival(bookingId, { status: 'ARRIVED', expectedAt: wv.arrival ? undefined : new Date().toISOString(), notes }, u);
  }
  async checkOut(u: AuthUser, bookingId: string, notes?: string) {
    const wv = await this.ownBooking(u, bookingId);
    if (!wv.arrival || !['ARRIVED', 'DELAYED'].includes(wv.arrival.status) || !wv.arrival.actualAt) throw new ConflictException(wv.arrival?.status === 'COMPLETED' ? 'Already checked out' : 'Check in before checking out');
    return this.events.setArrival(bookingId, { status: 'COMPLETED', notes }, u);
  }

  // ---- profile & services ----
  async profile(u: AuthUser) {
    const vendorId = this.vid(u);
    const [vendor, avail] = await Promise.all([
      this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, include: { services: { orderBy: { name: 'asc' } } } }),
      this.prisma.systemSetting.findUnique({ where: { key: `vendor.availability.${vendorId}` } }),
    ]);
    const a = (avail?.value ?? {}) as { blockedDates?: string[]; notes?: string };
    return { ...vendor, availability: { blockedDates: a.blockedDates ?? [], notes: a.notes ?? '' } };
  }
  async updateProfile(u: AuthUser, dto: UpdateVendorProfileDto) {
    const vendorId = this.vid(u);
    const data = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Prisma.VendorUpdateInput;
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to update');
    await this.prisma.vendor.update({ where: { id: vendorId }, data });
    await this.audit.log({ actorId: u.id, entity: 'Vendor', entityId: vendorId, action: 'portal.profile', message: `Vendor updated own profile (${Object.keys(data).join(', ')})` });
    return this.profile(u);
  }
  async addService(u: AuthUser, dto: ServiceDto) {
    const vendorId = this.vid(u);
    const s = await this.prisma.vendorService.create({ data: { ...dto, vendorId } });
    await this.audit.log({ actorId: u.id, entity: 'VendorService', entityId: s.id, action: 'create', message: `Vendor added service "${s.name}"` });
    return s;
  }
  private async ownService(u: AuthUser, id: string) {
    const s = await this.prisma.vendorService.findUnique({ where: { id } });
    if (!s || s.vendorId !== this.vid(u)) throw new NotFoundException('Service not found');
    return s;
  }
  async updateService(u: AuthUser, id: string, dto: UpdateServiceDto) {
    await this.ownService(u, id);
    const s = await this.prisma.vendorService.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: u.id, entity: 'VendorService', entityId: id, action: 'update', message: `Vendor updated service "${s.name}"` });
    return s;
  }
  async removeService(u: AuthUser, id: string) {
    const s = await this.ownService(u, id);
    await this.prisma.vendorService.delete({ where: { id } });
    await this.audit.log({ actorId: u.id, entity: 'VendorService', entityId: id, action: 'delete', message: `Vendor removed service "${s.name}"` });
    return { ok: true };
  }
  async setAvailability(u: AuthUser, dto: AvailabilityDto) {
    const vendorId = this.vid(u);
    const key = `vendor.availability.${vendorId}`;
    const cur = (await this.prisma.systemSetting.findUnique({ where: { key } }))?.value as { blockedDates?: string[]; notes?: string } | undefined;
    const value = { blockedDates: [...new Set(dto.blockedDates ?? cur?.blockedDates ?? [])].sort(), notes: dto.notes ?? cur?.notes ?? '' };
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value, updatedById: u.id }, update: { value, updatedById: u.id } });
    await this.audit.log({ actorId: u.id, entity: 'Vendor', entityId: vendorId, action: 'portal.availability', message: `Vendor updated availability (${value.blockedDates.length} blocked date(s))` });
    return this.profile(u);
  }

  // ---- documents ----
  private async docWhere(u: AuthUser, category?: DocumentCategory): Promise<Prisma.DocumentWhereInput> {
    const ids = (await this.scope.weddingIds(u)) ?? [];
    return { allowedRoles: { has: Role.VENDOR }, ...(category ? { category } : {}), OR: [{ weddingId: { in: ids } }, { uploadedBy: { vendorId: this.vid(u) } }] };
  }
  async documentsList(u: AuthUser, category?: DocumentCategory) {
    const rows = await this.prisma.document.findMany({ where: await this.docWhere(u, category), orderBy: { createdAt: 'desc' }, select: { id: true, name: true, category: true, mimeType: true, size: true, version: true, documentKey: true, createdAt: true, wedding: { select: { id: true, name: true } }, uploadedBy: { select: { name: true, role: true } } } });
    const seen = new Set<string>();
    return rows.filter((d) => (seen.has(d.documentKey) ? false : (seen.add(d.documentKey), true)));
  }
  async downloadDocument(u: AuthUser, id: string, inline: boolean) {
    if (!(await this.prisma.document.count({ where: { id, ...(await this.docWhere(u)) } }))) throw new NotFoundException('Document not found');
    const { doc, stream } = await this.docs.stream(u, id);
    return new StreamableFile(stream, { type: doc.mimeType, disposition: `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.name)}"` });
  }
  async uploadDocument(u: AuthUser, file: Express.Multer.File | undefined, body: { weddingId?: string; category?: DocumentCategory }) {
    if (!file) throw new BadRequestException('file is required');
    const category = body.category ?? 'OTHER';
    if (!VENDOR_DOC_CATEGORIES.includes(category)) throw new BadRequestException(`Category must be one of ${VENDOR_DOC_CATEGORIES.join(', ')}`);
    if (body.weddingId) await this.scope.assertWeddingAccess(u, body.weddingId);
    return this.docs.save({ weddingId: body.weddingId || null, name: file.originalname, category, buffer: file.buffer, mime: file.mimetype, uploadedById: u.id, allowedRoles: [Role.VENDOR, Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE] });
  }

  // ---- reviews ----
  async reviews(u: AuthUser) {
    const vendorId = this.vid(u);
    const rows = await this.prisma.vendorReview.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, include: { wedding: { select: { id: true, name: true } } } });
    const resp = await this.prisma.systemSetting.findMany({ where: { key: { in: rows.map((r) => `vendor.review.response.${r.id}`) } } });
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
    return {
      summary: { count: rows.length, average: avg(rows.map((r) => r.rating)), punctuality: avg(rows.filter((r) => r.punctuality != null).map((r) => r.punctuality!)), distribution: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: rows.filter((r) => r.rating === s).length })) },
      reviews: rows.map((r) => ({ id: r.id, rating: r.rating, punctuality: r.punctuality, comment: r.comment, createdAt: r.createdAt, wedding: r.wedding, response: (resp.find((x) => x.key === `vendor.review.response.${r.id}`)?.value as { text: string; at: string } | undefined) ?? null })),
    };
  }
  async respond(u: AuthUser, id: string, text: string) {
    const r = await this.prisma.vendorReview.findUnique({ where: { id } });
    if (!r || r.vendorId !== this.vid(u)) throw new NotFoundException('Review not found');
    if (!text.trim()) throw new BadRequestException('Response cannot be empty');
    const key = `vendor.review.response.${id}`;
    const value = { text: text.trim(), at: new Date().toISOString() };
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value, updatedById: u.id }, update: { value, updatedById: u.id } });
    await this.audit.log({ actorId: u.id, weddingId: r.weddingId, entity: 'VendorReview', entityId: id, action: 'respond', message: 'Vendor responded to a review' });
    return { id, response: value };
  }

  // ---- tasks ----
  async taskList(u: AuthUser) {
    const vendorId = this.vid(u);
    const rows = await this.prisma.weddingTask.findMany({ where: { weddingVendor: { vendorId } }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], include: { wedding: { select: { id: true, name: true } } } });
    return rows.map((t) => ({ id: t.id, name: t.name, description: t.description, category: t.category, priority: t.priority, status: t.status, dueDate: t.dueDate, completedAt: t.completedAt, evidenceNote: t.evidenceNote, wedding: t.wedding, overdue: t.status !== 'DONE' && t.dueDate < new Date() }));
  }
  async updateTask(u: AuthUser, id: string, dto: VendorTaskDto) {
    const t = await this.prisma.weddingTask.findUnique({ where: { id }, include: { weddingVendor: { select: { vendorId: true } } } });
    if (!t || t.weddingVendor?.vendorId !== this.vid(u)) throw new NotFoundException('Task not found');
    if (!dto.status && dto.evidenceNote === undefined) throw new BadRequestException('Nothing to update');
    if (t.status === 'DONE' && dto.status && dto.status !== 'DONE') throw new ForbiddenException('Completed tasks can only be reopened by your planner');
    await this.tasks.update(id, { status: dto.status, evidenceNote: dto.evidenceNote }, u);
    return (await this.taskList(u)).find((x) => x.id === id);
  }
}
