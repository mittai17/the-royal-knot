import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { DocumentCategory, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { AGREEMENT_NOT_SIGNED, isAgreementSigned, LOCKED_STATE, signedWeddingIds } from '../../common/agreement-gate';
import { AuthUser } from '../../common/decorators';
import { QuotationsService } from '../quotations/quotations.service';
import { dt } from '../../common/pdf-templates';
import { ScopeService } from '../../common/scope.service';
import { PrismaService } from '../../database/prisma.service';
import { AgreementsService } from '../agreements/agreements.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { CreateGuestDto, GuestQuery, UpdateGuestDto } from '../guests/guests.dto';
import { GuestsService } from '../guests/guests.service';
import { PaymentsService } from '../payments/payments.service';
import { WeddingsService } from '../weddings/weddings.service';
import { InviteDto } from './portal-client.dto';

/** Document categories a couple may see when the planner has not restricted roles explicitly. Internal / vendor paperwork is opt-in via allowedRoles. */
const CLIENT_DOC_CATEGORIES: DocumentCategory[] = ['AGREEMENT', 'RECEIPT', 'INVOICE', 'EVENT_SCHEDULE', 'FLOOR_PLAN', 'PHOTO', 'FINAL_REPORT'];
const ist = (d: Date) => new Date(d.getTime() + 19_800_000).toISOString().slice(0, 10);

@Injectable()
export class PortalClientService {
  constructor(
    private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private guests: GuestsService, private payments: PaymentsService,
    private weddings: WeddingsService, private docs: DocumentsService, private agreements: AgreementsService, private quotations: QuotationsService, @InjectQueue('email') private email: Queue,
  ) {}

  /** The wedding the portal shows: the requested one (must be the couple's own), else the next upcoming, else the latest. */
  async resolveWedding(u: AuthUser, weddingId?: string) {
    const ids = await this.scope.requireClientWeddingIds(u);
    if (weddingId) {
      if (!ids.includes(weddingId)) throw new ForbiddenException('You do not have access to this wedding');
      return this.prisma.wedding.findUniqueOrThrow({ where: { id: weddingId }, include: { couple: true, planner: { select: { id: true, name: true, email: true, phone: true } } } });
    }
    const all = await this.prisma.wedding.findMany({ where: { id: { in: ids }, status: { not: 'CANCELLED' } }, orderBy: { startDate: 'asc' }, include: { couple: true, planner: { select: { id: true, name: true, email: true, phone: true } } } });
    if (!all.length) throw new NotFoundException('No wedding is linked to your account yet');
    return all.find((w) => w.endDate >= new Date()) ?? all[all.length - 1];
  }

  private brief(w: Awaited<ReturnType<PortalClientService['resolveWedding']>>) {
    return { id: w.id, name: w.name, brideName: w.couple.brideName, groomName: w.couple.groomName, location: w.location, venue: w.venue, startDate: w.startDate, endDate: w.endDate, eventDays: w.eventDays, expectedGuests: w.expectedGuests, packageType: w.packageType, status: w.status, theme: w.theme };
  }

  async dashboard(u: AuthUser, weddingId?: string) {
    const w = await this.resolveWedding(u, weddingId);
    const [taskGroups, guestStats, pay, events] = await Promise.all([
      this.prisma.weddingTask.groupBy({ by: ['status'], where: { weddingId: w.id }, _count: true }),
      this.guests.stats(w.id),
      this.payments.forWedding(w.id),
      this.prisma.weddingEvent.findMany({ where: { weddingId: w.id, date: { gte: new Date(Date.now() - 864e5) } }, orderBy: { date: 'asc' }, take: 4 }),
    ]);
    const total = taskGroups.reduce((a, g) => a + g._count, 0);
    const done = taskGroups.find((g) => g.status === 'DONE')?._count ?? 0;
    const progress = (await this.weddings.progressFor([w.id]))[w.id] ?? 0;
    const next = pay.milestones.filter((m) => m.status !== 'PAID').sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    const expected = Number(pay.totals.expected);
    return {
      wedding: this.brief(w),
      daysToGo: Math.max(0, Math.ceil((w.startDate.getTime() - Date.now()) / 864e5)),
      tasks: { done, total },
      progress,
      guests: { expected: guestStats.weddingExpected, invited: guestStats.invitedHeadcount, invitations: guestStats.guests, confirmed: guestStats.confirmed, declined: guestStats.declined, pending: guestStats.pending },
      payments: { expected: pay.totals.expected, received: pay.totals.received, outstanding: pay.totals.outstanding, percentPaid: expected > 0 ? Math.round((Number(pay.totals.received) / expected) * 100) : 0, completedMilestones: pay.milestones.filter((m) => m.status === 'PAID').length, totalMilestones: pay.milestones.length, next: next ? { id: next.id, type: next.type, dueDate: next.dueDate, outstanding: next.outstanding, status: next.status } : null },
      upcomingEvents: events.map((e) => ({ id: e.id, name: e.name, kind: e.kind, date: e.date, venue: e.venue })),
      planner: w.planner,
    };
  }

  async wedding(u: AuthUser, weddingId?: string) {
    const w = await this.resolveWedding(u, weddingId);
    const [events, vendors, storyRow, signed, firstPayment] = await Promise.all([
      this.prisma.weddingEvent.findMany({ where: { weddingId: w.id }, orderBy: { date: 'asc' } }),
      this.prisma.weddingVendor.count({ where: { weddingId: w.id } }),
      this.prisma.systemSetting.findUnique({ where: { key: `portal.story.${w.id}` } }),
      this.prisma.agreementSignature.findFirst({ where: { agreement: { weddingId: w.id, status: 'SIGNED' } }, orderBy: { signedAt: 'asc' } }),
      this.prisma.clientPayment.findFirst({ where: { weddingId: w.id }, orderBy: { paidAt: 'asc' } }),
    ]);
    const unlocked = await isAgreementSigned(this.prisma, w.id); // vendor names stay hidden until the agreement is signed
    const bookings = unlocked ? await this.prisma.weddingVendor.findMany({ where: { weddingId: w.id }, orderBy: { createdAt: 'asc' }, include: { vendor: { select: { name: true } } }, take: 6 }) : [];
    const journey = [
      { at: w.createdAt, title: 'Your wedding workspace was created', kind: 'start' },
      ...(signed ? [{ at: signed.signedAt, title: 'Planning agreement signed', kind: 'agreement' }] : []),
      ...(firstPayment ? [{ at: firstPayment.paidAt, title: 'First payment received', kind: 'payment' }] : []),
      ...bookings.map((b) => ({ at: b.createdAt, title: `${b.vendor.name} booked for ${b.category.toLowerCase().replace('_', ' ')}`, kind: 'vendor' })),
      ...events.map((e) => ({ at: e.date, title: e.name, kind: 'event' })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    return { wedding: this.brief(w), couple: { brideName: w.couple.brideName, groomName: w.couple.groomName, email: w.couple.email, phone: w.couple.phone }, planner: w.planner, events, vendorCount: unlocked ? vendors : 0, vendorsLocked: !unlocked, story: (storyRow?.value as { text?: string } | null)?.text ?? '', journey };
  }

  async setStory(u: AuthUser, story: string) {
    const w = await this.resolveWedding(u);
    const key = `portal.story.${w.id}`;
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: { text: story }, updatedById: u.id }, update: { value: { text: story }, updatedById: u.id } });
    await this.audit.log({ actorId: u.id, weddingId: w.id, entity: 'Wedding', entityId: w.id, action: 'story.update', message: 'Client updated "Our story"' });
    return { story };
  }

  async planner(u: AuthUser) {
    const w = await this.resolveWedding(u);
    return { wedding: { id: w.id, name: w.name, startDate: w.startDate }, planner: w.planner, packageType: w.packageType };
  }

  async schedule(u: AuthUser, weddingId?: string) {
    const w = await this.resolveWedding(u, weddingId);
    const [events, items] = await Promise.all([
      this.prisma.weddingEvent.findMany({ where: { weddingId: w.id }, orderBy: { date: 'asc' } }),
      this.prisma.timelineItem.findMany({ where: { weddingId: w.id }, orderBy: { scheduledAt: 'asc' }, include: { event: { select: { name: true } } } }),
    ]);
    const days = new Map<string, { date: string; events: typeof events; items: { id: string; title: string; scheduledAt: Date; status: string; eventName: string | null; delayMinutes: number }[] }>();
    const day = (d: Date) => { const k = ist(d); if (!days.has(k)) days.set(k, { date: k, events: [], items: [] }); return days.get(k)!; };
    events.forEach((e) => day(e.date).events.push(e));
    items.forEach((i) => day(i.scheduledAt).items.push({ id: i.id, title: i.title, scheduledAt: i.scheduledAt, status: i.status, eventName: i.event?.name ?? null, delayMinutes: i.delayMinutes }));
    return { wedding: this.brief(w), days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  }

  /**
   * Vendors & services. Agreement gate (decision 2): until the wedding's service agreement is SIGNED this returns
   * `{ locked: true, reason: 'AGREEMENT_NOT_SIGNED', vendors: [], comparisons: [] }` (HTTP 200, not an error). Once signed it returns the booked
   * vendors plus the shortlist / quotation comparison per RFQ round that the couple can choose from.
   */
  async vendors(u: AuthUser, weddingId?: string) {
    const w = await this.resolveWedding(u, weddingId);
    if (!(await isAgreementSigned(this.prisma, w.id))) return { wedding: { id: w.id, name: w.name }, ...LOCKED_STATE, vendors: [], comparisons: [] };
    const wvs = await this.prisma.weddingVendor.findMany({ where: { weddingId: w.id }, orderBy: { category: 'asc' }, include: { vendor: { select: { id: true, name: true, businessName: true, category: true, contactName: true, phone: true, email: true, rating: true } }, arrival: { select: { status: true, expectedAt: true } } } });
    const quotes = await this.prisma.quotation.findMany({ where: { id: { in: wvs.map((v) => v.quotationId).filter((x): x is string => !!x) } }, include: { items: { where: { included: true }, select: { name: true, description: true, quantity: true, unit: true } } } });
    return {
      wedding: { id: w.id, name: w.name }, locked: false as const,
      vendors: wvs.map((v) => ({ id: v.id, category: v.category, vendor: v.vendor, amount: v.negotiatedAmount ?? v.contractAmount, notes: v.notes, arrival: v.arrival, menu: quotes.find((q) => q.id === v.quotationId)?.menu ?? null, services: quotes.find((q) => q.id === v.quotationId)?.items ?? [] })),
      comparisons: await this.comparisons(w.id),
    };
  }

  /** Vendor comparison for the couple (gated by the caller): one entry per RFQ round that was actually sent. */
  private async comparisons(weddingId: string) {
    const reqs = await this.prisma.quotationRequest.findMany({ where: { weddingId, status: { not: 'DRAFT' }, quotation: { isNot: null } }, orderBy: { createdAt: 'asc' }, include: { vendor: { select: { id: true, name: true, businessName: true, rating: true } }, quotation: { include: { items: { where: { included: true }, select: { name: true, quantity: true, unit: true } } } } } });
    const groups = new Map<string, typeof reqs>();
    for (const r of reqs) groups.set(r.rfqGroup, [...(groups.get(r.rfqGroup) ?? []), r]);
    const out = [];
    for (const [rfqGroup, rs] of groups) {
      const pick = await this.quotations.clientSelection(rfqGroup);
      out.push({
        rfqGroup, category: rs[0].category, title: rs[0].title, decided: rs.some((r) => r.status === 'SELECTED'), clientSelection: pick ? { quotationId: pick.quotationId, at: pick.at } : null,
        options: rs.map((r) => ({ quotationId: r.quotation!.id, status: r.quotation!.status, vendor: r.vendor, menu: r.quotation!.menu, grandTotal: r.quotation!.grandTotal, pricePerPlate: r.quotation!.pricePerPlate, guestCapacity: r.quotation!.guestCapacity, validUntil: r.quotation!.validUntil, services: r.quotation!.items })),
      });
    }
    return out;
  }

  /** The couple records which quotation they prefer. Gated by the agreement; the planner then awards the vendor. */
  async selectVendor(u: AuthUser, quotationId: string, note?: string) {
    return this.quotations.recordClientSelection(quotationId, note, u);
  }

  // ---- guests (reuses GuestsService so validation, stats, CSV rules and live broadcasts stay identical) ----
  async guestList(u: AuthUser, q: GuestQuery) { const w = await this.resolveWedding(u); return this.guests.list(w.id, q); }
  async guestStats(u: AuthUser) { const w = await this.resolveWedding(u); return this.guests.stats(w.id); }
  async addGuest(u: AuthUser, dto: CreateGuestDto) {
    const w = await this.resolveWedding(u);
    // Invitation status is system-driven (see invite()); RSVP may be recorded by the couple on a guest's behalf.
    return this.guests.create(w.id, { ...dto, invitationStatus: 'NOT_SENT' }, u);
  }
  private async ownGuest(u: AuthUser, id: string) {
    const g = await this.prisma.guest.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Guest not found');
    await this.scope.assertWeddingAccess(u, g.weddingId);
    return g;
  }
  async updateGuest(u: AuthUser, id: string, dto: UpdateGuestDto) { await this.ownGuest(u, id); const { invitationStatus: _ignored, ...safe } = dto; void _ignored; return this.guests.update(id, safe, u); }
  async removeGuest(u: AuthUser, id: string) { await this.ownGuest(u, id); return this.guests.remove(id, u); }
  async importGuests(u: AuthUser, csv: string) { const w = await this.resolveWedding(u); return this.guests.importCsv(w.id, csv, u); }

  /** Queues an invitation email per guest (delivered by the BullMQ email worker) and marks the invitation SENT. Guests without an email are reported, not failed. */
  async invite(u: AuthUser, dto: InviteDto) {
    const w = await this.resolveWedding(u);
    if (!dto.allPending && !dto.guestIds?.length) throw new BadRequestException('Select guests to invite, or set allPending');
    const guests = await this.prisma.guest.findMany({ where: { weddingId: w.id, ...(dto.guestIds?.length ? { id: { in: dto.guestIds } } : { invitationStatus: 'NOT_SENT' }) } });
    if (dto.guestIds?.length && guests.length !== new Set(dto.guestIds).size) throw new ForbiddenException('One or more guests do not belong to your wedding');
    const sent: string[] = []; const skipped: { id: string; name: string; reason: string }[] = [];
    for (const g of guests) {
      if (!g.email) { skipped.push({ id: g.id, name: g.name, reason: 'No email address' }); continue; }
      try {
        await this.email.add('send', {
          to: g.email, subject: `You are invited: ${w.name}`,
          text: `Dear ${g.name},\n\n${w.couple.brideName} & ${w.couple.groomName} warmly invite you to their wedding${w.venue ? ` at ${w.venue}` : ''}, ${w.location}, from ${dt(w.startDate)} to ${dt(w.endDate)}.\n\nPlease let the family know if you can join us.\n\nWith love,\n${w.couple.brideName} & ${w.couple.groomName}\n(sent via The Royal Knot)`,
        }, { attempts: 3, removeOnComplete: 100 });
        sent.push(g.id);
      } catch { skipped.push({ id: g.id, name: g.name, reason: 'Email queue unavailable' }); }
    }
    if (sent.length) await this.prisma.guest.updateMany({ where: { id: { in: sent } }, data: { invitationStatus: 'SENT' } });
    await this.audit.log({ actorId: u.id, weddingId: w.id, entity: 'Guest', action: 'invite', message: `Queued ${sent.length} invitation email(s)${skipped.length ? `, ${skipped.length} skipped` : ''}`, meta: { guestIds: sent } });
    return { queued: sent.length, skipped };
  }

  // ---- documents & contracts ----
  /** Floor plans are part of the vendor/venue layout phase: hidden until the agreement is signed (decision 2). */
  private async docWhere(ids: string[]): Promise<Prisma.DocumentWhereInput> {
    const signed = [...(await signedWeddingIds(this.prisma, ids))];
    return { weddingId: { in: ids }, AND: [{ OR: [{ allowedRoles: { has: 'CLIENT' } }, { allowedRoles: { isEmpty: true }, category: { in: CLIENT_DOC_CATEGORIES } }] }, { NOT: { category: 'FLOOR_PLAN', weddingId: { notIn: signed } } }] };
  }

  async documents(u: AuthUser) {
    const w = await this.resolveWedding(u);
    const signed = await isAgreementSigned(this.prisma, w.id);
    const rows = await this.prisma.document.findMany({ where: await this.docWhere([w.id]), orderBy: { createdAt: 'desc' }, select: { id: true, name: true, category: true, mimeType: true, size: true, version: true, documentKey: true, createdAt: true } });
    const seen = new Set<string>();
    const documents = rows.filter((d) => (seen.has(d.documentKey) ? false : (seen.add(d.documentKey), true)));
    const agreements = await this.prisma.agreement.findMany({ where: { weddingId: w.id, status: { in: ['SENT', 'SIGNED'] } }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, amount: true, paymentTerms: true, createdAt: true, signatures: { select: { id: true, signerName: true, signerRole: true, signedAt: true } } } });
    const floorPlans = signed ? { locked: false as const, count: documents.filter((d) => d.category === 'FLOOR_PLAN').length } : { ...LOCKED_STATE };
    return { wedding: { id: w.id, name: w.name }, documents, agreements, floorPlans };
  }

  async downloadDocument(u: AuthUser, id: string, inline: boolean) {
    const ids = await this.scope.requireClientWeddingIds(u);
    const ok = await this.prisma.document.count({ where: { id, ...(await this.docWhere(ids)) } });
    if (!ok) {
      const fp = await this.prisma.document.findFirst({ where: { id, category: 'FLOOR_PLAN', weddingId: { in: ids } }, select: { id: true } });
      if (fp) throw new ForbiddenException({ message: 'Floor plans unlock once the service agreement is signed', code: AGREEMENT_NOT_SIGNED, locked: true, reason: AGREEMENT_NOT_SIGNED });
      throw new NotFoundException('Document not found');
    }
    const { doc, stream } = await this.docs.stream(u, id);
    return new StreamableFile(stream, { type: doc.mimeType, disposition: `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.name)}"` });
  }

  async agreementPdf(u: AuthUser, id: string) {
    const a = await this.prisma.agreement.findUnique({ where: { id }, select: { weddingId: true, status: true } });
    if (!a || !['SENT', 'SIGNED'].includes(a.status)) throw new NotFoundException('Agreement not found');
    await this.scope.assertWeddingAccess(u, a.weddingId);
    return this.agreements.pdfStream(id, u);
  }

  // ---- payments ----
  async paymentsOverview(u: AuthUser) {
    const w = await this.resolveWedding(u);
    const p = await this.payments.forWedding(w.id);
    const milestones = p.milestones.map((m) => ({
      id: m.id, type: m.type, dueDate: m.dueDate, expectedAmount: m.expectedAmount, received: m.received, outstanding: m.outstanding, status: m.status,
      payments: m.payments.map((x) => ({ id: x.id, amount: x.amount, method: x.method, reference: x.reference, paidAt: x.paidAt, receiptNo: x.receiptNo })),
    }));
    const receipts = milestones.flatMap((m) => m.payments.map((x) => ({ ...x, milestone: m.type }))).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
    const invoices = await this.prisma.clientInvoice.findMany({ where: { weddingId: w.id, status: { not: 'DRAFT' } }, orderBy: { issueDate: 'desc' }, select: { id: true, invoiceNo: true, status: true, issueDate: true, dueDate: true, total: true, amountPaid: true } });
    return { wedding: { id: w.id, name: w.name, contractValue: w.contractValue }, totals: p.totals, milestones, receipts, invoices };
  }

  async receiptPdf(u: AuthUser, paymentId: string) {
    const pay = await this.prisma.clientPayment.findUnique({ where: { id: paymentId }, select: { weddingId: true } });
    if (!pay) throw new NotFoundException('Payment not found');
    await this.scope.assertWeddingAccess(u, pay.weddingId);
    return this.payments.receipt(paymentId);
  }

  async upiQr(u: AuthUser, milestoneId: string) {
    const m = await this.prisma.paymentMilestone.findUnique({ where: { id: milestoneId }, select: { weddingId: true } });
    if (!m) throw new NotFoundException('Milestone not found');
    await this.scope.assertWeddingAccess(u, m.weddingId);
    return this.payments.upiLink(milestoneId);
  }
}
