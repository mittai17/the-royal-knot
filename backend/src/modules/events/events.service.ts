import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { confirmedWeddingWhere } from '../../common/booking';
import { AuthUser } from '../../common/decorators';
import { ScopeService } from '../../common/scope.service';
import { ARRIVAL_TRANSITIONS, assertTransition, INCIDENT_TRANSITIONS } from '../../common/state-machines';
import { WeddingsService } from '../weddings/weddings.service';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { ActualGuestsDto, ArrivalDto, CreateIncidentDto, CreateTimelineDto, EventStatusDto, UpdateIncidentDto, UpdateTimelineDto } from './events.dto';

const mins = (a: Date, b: Date) => Math.max(0, Math.round((a.getTime() - b.getTime()) / 60000));
const incInclude = { assignedTo: { select: { id: true, name: true } } } satisfies Prisma.IncidentInclude;

/** Every mutation: 1) persist in PostgreSQL (+ audit) 2) broadcast the saved row. Clients refetch GET /weddings/:id/event after reconnect. */
@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private rt: RealtimeService, private notif: NotificationsService, private recon: ReconciliationService, private scope: ScopeService, private weddings: WeddingsService) {}

  async live(user?: AuthUser) {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 864e5);
    return this.prisma.wedding.findMany({
      // confirmed bookings only; staff see their assigned weddings only
      where: { ...confirmedWeddingWhere(), ...(user ? { AND: [this.scope.weddingWhere(user)] } : {}), OR: [{ status: 'EVENT_DAY' }, { startDate: { lt: end }, endDate: { gte: start }, status: { notIn: ['CANCELLED', 'COMPLETED'] } }] },
      select: { id: true, name: true, venue: true, location: true, status: true, startDate: true, endDate: true, expectedGuests: true, actualGuests: true }, orderBy: { startDate: 'asc' },
    });
  }

  async bundle(weddingId: string, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    const w = await this.prisma.wedding.findUnique({ where: { id: weddingId }, include: { couple: true, events: { orderBy: { date: 'asc' } }, planner: { select: { id: true, name: true, phone: true } } } });
    if (!w) throw new NotFoundException('Wedding not found');
    const [timeline, vendors, incidents, guests, checked, staff, openTasks] = await Promise.all([
      this.prisma.timelineItem.findMany({ where: { weddingId }, orderBy: { scheduledAt: 'asc' }, include: { event: { select: { id: true, name: true } } } }),
      this.prisma.weddingVendor.findMany({ where: { weddingId }, include: { vendor: { select: { id: true, name: true, contactName: true, phone: true, category: true } }, arrival: true }, orderBy: { category: 'asc' } }),
      this.prisma.incident.findMany({ where: { weddingId }, orderBy: { createdAt: 'desc' }, include: incInclude }),
      this.prisma.guest.aggregate({ where: { weddingId, rsvp: 'CONFIRMED' }, _count: true, _sum: { plusOnes: true } }),
      this.prisma.guest.aggregate({ where: { weddingId }, _sum: { checkedInCount: true } }),
      this.prisma.user.findMany({ where: { status: UserStatus.ACTIVE, role: { in: ['EVENT_MANAGER', 'OPERATIONS', 'PLANNER'] } }, select: { id: true, name: true, role: true, phone: true } }),
      this.prisma.weddingTask.groupBy({ by: ['ownerId'], where: { weddingId, status: { not: 'DONE' } }, _count: true }),
    ]);
    const now = new Date();
    const today = w.events.find((e) => e.date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) ?? w.events.find((e) => e.date >= now) ?? w.events[w.events.length - 1] ?? null;
    return {
      serverTime: now.toISOString(),
      wedding: { id: w.id, name: w.name, venue: w.venue, location: w.location, status: w.status, startDate: w.startDate, endDate: w.endDate, couple: w.couple, planner: w.planner },
      guests: { expected: w.expectedGuests, confirmed: guests._count + (guests._sum.plusOnes ?? 0), actual: w.actualGuests, checkedIn: checked._sum.checkedInCount ?? 0 },
      events: w.events, currentEvent: today, timeline, vendors: vendors.map((v) => ({ ...v, arrival: v.arrival ?? null })), incidents,
      staff: staff.map((s) => ({ ...s, openTasks: openTasks.find((t) => t.ownerId === s.id)?._count ?? 0, openIncidents: incidents.filter((i) => i.assignedToId === s.id && !['RESOLVED', 'CLOSED'].includes(i.status)).length })),
      summary: { arrived: vendors.filter((v) => v.arrival?.status === 'ARRIVED' || v.arrival?.status === 'COMPLETED').length, delayed: vendors.filter((v) => v.arrival?.status === 'DELAYED').length, vendors: vendors.length, openIncidents: incidents.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status)).length },
    };
  }

  async addTimeline(weddingId: string, dto: CreateTimelineDto, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    if (!(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
    const t = await this.prisma.timelineItem.create({ data: { ...dto, weddingId, scheduledAt: new Date(dto.scheduledAt) } });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'TimelineItem', entityId: t.id, action: 'create', message: `Added timeline item "${t.title}"` });
    this.rt.toWedding(weddingId, 'timeline.updated', t);
    return t;
  }

  async updateTimeline(id: string, dto: UpdateTimelineDto, actor: AuthUser) {
    const prev = await this.prisma.timelineItem.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Timeline item not found');
    await this.scope.assertWeddingAccess(actor, prev.weddingId);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : prev.scheduledAt;
    let actualAt = dto.actualAt ? new Date(dto.actualAt) : prev.actualAt;
    if (!actualAt && (dto.status === 'IN_PROGRESS' || dto.status === 'COMPLETED')) actualAt = new Date();
    let delay = dto.delayMinutes ?? prev.delayMinutes;
    if (dto.status === 'DELAYED') delay = dto.delayMinutes ?? Math.max(prev.delayMinutes, mins(new Date(), scheduledAt));
    else if (actualAt && dto.delayMinutes === undefined) delay = mins(actualAt, scheduledAt);
    const { actualAt: _a, scheduledAt: _s, delayMinutes: _d, ...rest } = dto;
    const t = await this.prisma.timelineItem.update({ where: { id }, data: { ...rest, scheduledAt, actualAt, delayMinutes: delay }, include: { event: { select: { id: true, name: true } } } });
    await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'TimelineItem', entityId: id, action: 'update', message: dto.status && dto.status !== prev.status ? `"${t.title}" ${prev.status} → ${t.status}${delay ? ` (${delay} min delay)` : ''}` : `Updated "${t.title}"` });
    this.rt.toWedding(t.weddingId, 'timeline.updated', t);
    if (t.status === 'DELAYED' && prev.status !== 'DELAYED') await this.notif.notify({ type: 'timeline.delayed', title: 'Schedule delayed', body: `${t.title} · ${delay} min`, link: `/command-centre?wedding=${t.weddingId}`, roles: ['EVENT_MANAGER', 'OPERATIONS'] });
    return t;
  }

  async deleteTimeline(id: string, actor: AuthUser) {
    const cur = await this.prisma.timelineItem.findUnique({ where: { id }, select: { weddingId: true } });
    if (!cur) throw new NotFoundException('Timeline item not found');
    await this.scope.assertWeddingAccess(actor, cur.weddingId);
    const t = await this.prisma.timelineItem.delete({ where: { id } }).catch(() => { throw new NotFoundException('Timeline item not found'); });
    await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'TimelineItem', entityId: id, action: 'delete', message: `Removed "${t.title}"` });
    this.rt.toWedding(t.weddingId, 'timeline.updated', { id, deleted: true });
    return { ok: true };
  }

  async setArrival(weddingVendorId: string, dto: ArrivalDto, actor: AuthUser) {
    const wv = await this.prisma.weddingVendor.findUnique({ where: { id: weddingVendorId }, include: { vendor: true, arrival: true } });
    if (!wv) throw new NotFoundException('Vendor assignment not found');
    await this.scope.assertWeddingAccess(actor, wv.weddingId);
    if (wv.arrival) assertTransition('Vendor arrival', ARRIVAL_TRANSITIONS, wv.arrival.status, dto.status, { allowSame: true });
    const expectedAt = dto.expectedAt ? new Date(dto.expectedAt) : wv.arrival?.expectedAt;
    if (!expectedAt) throw new BadRequestException('expectedAt is required the first time an arrival is recorded');
    let actualAt = dto.actualAt ? new Date(dto.actualAt) : wv.arrival?.actualAt ?? null;
    if (!actualAt && (dto.status === 'ARRIVED' || dto.status === 'COMPLETED')) actualAt = new Date();
    if (dto.status === 'EXPECTED') actualAt = null;
    let delay = dto.delayMinutes ?? 0;
    if (actualAt && dto.delayMinutes === undefined) delay = mins(actualAt, expectedAt);
    if (dto.status === 'DELAYED' && dto.delayMinutes === undefined) delay = Math.max(wv.arrival?.delayMinutes ?? 0, mins(new Date(), expectedAt));
    const data = { expectedAt, actualAt, status: dto.status, delayMinutes: delay, contactName: dto.contactName ?? wv.arrival?.contactName ?? wv.vendor.contactName, contactPhone: dto.contactPhone ?? wv.arrival?.contactPhone ?? wv.vendor.phone, notes: dto.notes ?? wv.arrival?.notes };
    const a = await this.prisma.vendorArrival.upsert({ where: { weddingVendorId }, create: { ...data, weddingVendorId, weddingId: wv.weddingId }, update: data });
    await this.audit.log({ actorId: actor.id, weddingId: wv.weddingId, entity: 'VendorArrival', entityId: a.id, action: dto.status.toLowerCase(), message: `${wv.vendor.name}: ${dto.status.replace('_', ' ').toLowerCase()}${delay ? ` (${delay} min late)` : ''}` });
    this.rt.toWedding(wv.weddingId, 'vendor.arrival', { ...a, weddingVendorId, vendor: { id: wv.vendor.id, name: wv.vendor.name, category: wv.vendor.category } });
    if (dto.status === 'DELAYED') await this.notif.notify({ type: 'vendor.delayed', title: 'Vendor delayed', body: `${wv.vendor.name} · ${delay} min late`, link: `/command-centre?wedding=${wv.weddingId}`, roles: ['EVENT_MANAGER', 'OPERATIONS'] });
    return a;
  }

  async createIncident(weddingId: string, dto: CreateIncidentDto, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    if (!(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
    const i = await this.prisma.incident.create({ data: { ...dto, weddingId, severity: dto.severity ?? 'MEDIUM' }, include: incInclude });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'Incident', entityId: i.id, action: 'create', message: `Incident (${i.severity}): ${i.title}` });
    this.rt.toWedding(weddingId, 'incident.created', i);
    await this.notif.notify({ type: 'incident.created', title: `Incident: ${i.title}`, body: i.description.slice(0, 120), link: `/command-centre?wedding=${weddingId}`, roles: ['EVENT_MANAGER', 'OPERATIONS', 'PLANNER'], ...(i.assignedToId ? { userIds: [i.assignedToId] } : {}) });
    return i;
  }

  async updateIncident(id: string, dto: UpdateIncidentDto, actor: AuthUser) {
    const prev = await this.prisma.incident.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Incident not found');
    await this.scope.assertWeddingAccess(actor, prev.weddingId);
    if (dto.status) {
      assertTransition('Incident', INCIDENT_TRANSITIONS, prev.status, dto.status, { allowSame: true });
      if (dto.status === 'ASSIGNED' && !(dto.assignedToId ?? prev.assignedToId)) throw new BadRequestException('Assign the incident to someone before marking it ASSIGNED');
    }
    if (dto.status === 'RESOLVED' && !(dto.resolution ?? prev.resolution)) throw new BadRequestException('A resolution note is required to resolve an incident');
    const i = await this.prisma.incident.update({ where: { id }, data: { ...dto, ...(dto.status ? { resolvedAt: dto.status === 'RESOLVED' ? new Date() : null } : {}) }, include: incInclude });
    await this.audit.log({ actorId: actor.id, weddingId: i.weddingId, entity: 'Incident', entityId: id, action: 'update', message: dto.status && dto.status !== prev.status ? `Incident "${i.title}" ${prev.status} → ${i.status}${dto.resolution ? `: ${dto.resolution}` : ''}` : `Updated incident "${i.title}"` });
    this.rt.toWedding(i.weddingId, 'incident.updated', i);
    return i;
  }

  async incidentHistory(id: string, user?: AuthUser) {
    if (user) {
      const inc = await this.prisma.incident.findUnique({ where: { id }, select: { weddingId: true } });
      if (!inc) throw new NotFoundException('Incident not found');
      await this.scope.assertWeddingAccess(user, inc.weddingId);
    }
    return this.prisma.activityLog.findMany({ where: { entity: 'Incident', entityId: id }, orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } });
  }

  async setStatus(weddingId: string, dto: EventStatusDto, actor: AuthUser) {
    // single source of truth for the legacy status: maps onto executionStage and refuses event day / completed for an unconfirmed draft
    const w = await this.weddings.setStatus(weddingId, dto.status, actor);
    this.rt.toWedding(weddingId, 'event.status', { status: w.status });
    if (w.status === 'COMPLETED') await this.notif.notify({ type: 'wedding.completed', title: 'Wedding completed', body: w.name, link: `/weddings/${weddingId}`, roles: ['PLANNER', 'FINANCE'] });
    return w;
  }

  /** Actual attendance (manual count or total check-ins). Triggers the extra-guest charge calculation. */
  async setActualGuests(weddingId: string, dto: ActualGuestsDto, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    let actual = dto.actualGuests;
    if (dto.fromCheckIn) actual = (await this.prisma.guest.aggregate({ where: { weddingId }, _sum: { checkedInCount: true } }))._sum.checkedInCount ?? 0;
    if (actual === undefined) throw new BadRequestException('Provide actualGuests or fromCheckIn');
    const charge = await this.prisma.$transaction(async (tx) => {
      const w = await tx.wedding.update({ where: { id: weddingId }, data: { actualGuests: actual } });
      await this.audit.log({ actorId: actor.id, weddingId, entity: 'Wedding', entityId: weddingId, action: 'actual_guests', message: `Actual guests set to ${actual} (expected ${w.expectedGuests})` }, tx);
      return this.recon.syncExtraGuestCharge(weddingId, tx);
    });
    const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id: weddingId } });
    const payload = { expected: w.expectedGuests, actual: w.actualGuests, extraGuests: Math.max(0, (w.actualGuests ?? 0) - w.expectedGuests), extraCharge: charge?.amount ?? 0 };
    this.rt.toWedding(weddingId, 'guests.updated', payload);
    return { ...payload, charge };
  }
}
