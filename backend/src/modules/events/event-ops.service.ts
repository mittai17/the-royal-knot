import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ArrivalQuery, CalendarQuery, CreateFunctionDto, DayQuery, FunctionQuery, FunctionStatus, IncidentQuery, UpdateFunctionDto } from './event-ops.dto';

const DAY = 864e5;
const NAMES: Record<string, string> = { MEHENDI: 'Mehendi', SANGEET: 'Sangeet', CEREMONY: 'Wedding Ceremony', RECEPTION: 'Reception', HALDI: 'Haldi', OTHER: 'Function' };
const fnKey = (id: string) => `fn:${id}`;

/** Extra per-function data that has no column yet (see docs/SCHEMA_REQUESTS.md): stored in SystemSetting under `fn:<eventId>`. */
interface FnMeta { status?: FunctionStatus; endAt?: string; notes?: string; vendorIds?: string[] }

/** [start, end) of a calendar day in the caller's timezone; defaults to "today" in UTC when nothing is sent. */
export function dayRange(q: DayQuery, now = new Date()): { start: Date; end: Date; date: string } {
  const tz = q.tz ?? 0;
  let y: number, m: number, d: number;
  if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) [y, m, d] = [Number(q.date.slice(0, 4)), Number(q.date.slice(5, 7)) - 1, Number(q.date.slice(8, 10))];
  else { const local = new Date(now.getTime() + tz * 60000); [y, m, d] = [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()]; }
  const start = new Date(Date.UTC(y, m, d) - tz * 60000);
  return { start, end: new Date(start.getTime() + DAY), date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

/** Without an explicit status: upcoming before the start, in progress until the end (default 12 h after the start), completed afterwards. */
export function deriveStatus(date: Date, meta: FnMeta | undefined, now = new Date()): FunctionStatus {
  if (meta?.status) return meta.status;
  const end = meta?.endAt ? new Date(meta.endAt).getTime() : date.getTime() + 12 * 36e5;
  if (now.getTime() < date.getTime()) return 'UPCOMING';
  return now.getTime() <= end ? 'IN_PROGRESS' : 'COMPLETED';
}

export type ArrivalBucket = 'pending' | 'arrived' | 'delayed' | 'completed';
export function arrivalBucket(a: { status: string } | null | undefined): ArrivalBucket {
  if (!a || a.status === 'NOT_ARRIVED') return 'pending';
  if (a.status === 'ARRIVED') return 'arrived';
  if (a.status === 'DELAYED') return 'delayed';
  return 'completed';
}

@Injectable()
export class EventOpsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private rt: RealtimeService, private notif: NotificationsService) {}

  // ---------------------------------------------------------------- functions
  private async metaFor(ids: string[]): Promise<Map<string, FnMeta>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: ids.map(fnKey) } } });
    return new Map(rows.map((r) => [r.key.slice(3), (r.value ?? {}) as FnMeta]));
  }

  private async shape(events: Prisma.WeddingEventGetPayload<{ include: { wedding: { select: { id: true; name: true; venue: true; location: true } } } }>[]) {
    const ids = events.map((e) => e.id);
    const [meta, tl] = await Promise.all([
      this.metaFor(ids),
      this.prisma.timelineItem.groupBy({ by: ['eventId', 'status'], where: { eventId: { in: ids } }, _count: true }),
    ]);
    const vids = [...new Set([...meta.values()].flatMap((m) => m.vendorIds ?? []))];
    const wvs = vids.length ? await this.prisma.weddingVendor.findMany({ where: { id: { in: vids } }, select: { id: true, category: true, vendor: { select: { id: true, name: true, phone: true } } } }) : [];
    const wvMap = new Map(wvs.map((w) => [w.id, w]));
    return events.map((e) => {
      const m = meta.get(e.id);
      const rows = tl.filter((t) => t.eventId === e.id);
      return {
        id: e.id, weddingId: e.weddingId, wedding: e.wedding, kind: e.kind, name: e.name, date: e.date, endAt: m?.endAt ?? null, venue: e.venue ?? e.wedding.venue ?? e.wedding.location, expectedGuests: e.expectedGuests,
        notes: m?.notes ?? null, status: deriveStatus(e.date, m), statusOverride: m?.status ?? null,
        vendors: (m?.vendorIds ?? []).map((v) => wvMap.get(v)).filter((v): v is NonNullable<typeof v> => !!v),
        timeline: { total: rows.reduce((s, r) => s + r._count, 0), done: rows.filter((r) => r.status === 'COMPLETED').reduce((s, r) => s + r._count, 0) },
      };
    });
  }

  async functions(q: FunctionQuery) {
    const where: Prisma.WeddingEventWhereInput = {
      ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { venue: { contains: q.search, mode: 'insensitive' } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const events = await this.prisma.weddingEvent.findMany({ where, orderBy: { date: 'asc' }, take: 500, include: { wedding: { select: { id: true, name: true, venue: true, location: true } } } });
    const rows = await this.shape(events);
    return q.status ? rows.filter((r) => r.status === q.status) : rows;
  }

  async functionById(id: string) {
    const e = await this.prisma.weddingEvent.findUnique({ where: { id }, include: { wedding: { select: { id: true, name: true, venue: true, location: true } } } });
    if (!e) throw new NotFoundException('Function not found');
    const [row] = await this.shape([e]);
    const timeline = await this.prisma.timelineItem.findMany({ where: { eventId: id }, orderBy: { scheduledAt: 'asc' } });
    return { ...row, timelineItems: timeline };
  }

  private async assertVendors(weddingId: string, ids?: string[]) {
    if (!ids?.length) return;
    const n = await this.prisma.weddingVendor.count({ where: { id: { in: ids }, weddingId } });
    if (n !== new Set(ids).size) throw new BadRequestException('One or more vendors are not booked on this wedding');
  }
  private async saveMeta(eventId: string, patch: FnMeta, actor: AuthUser) {
    const cur = ((await this.prisma.systemSetting.findUnique({ where: { key: fnKey(eventId) } }))?.value ?? {}) as FnMeta;
    const value = { ...cur, ...patch } as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({ where: { key: fnKey(eventId) }, create: { key: fnKey(eventId), value, updatedById: actor.id }, update: { value, updatedById: actor.id } });
  }

  async createFunction(dto: CreateFunctionDto, actor: AuthUser) {
    const w = await this.prisma.wedding.findUnique({ where: { id: dto.weddingId } });
    if (!w) throw new NotFoundException('Wedding not found');
    if (dto.endAt && new Date(dto.endAt) <= new Date(dto.date)) throw new BadRequestException('End time must be after the start time');
    await this.assertVendors(dto.weddingId, dto.vendorIds);
    const e = await this.prisma.weddingEvent.create({ data: { weddingId: dto.weddingId, kind: dto.kind, name: dto.name?.trim() || NAMES[dto.kind], date: new Date(dto.date), venue: dto.venue ?? w.venue, expectedGuests: dto.expectedGuests ?? w.expectedGuests } });
    await this.saveMeta(e.id, { status: dto.status, endAt: dto.endAt, notes: dto.notes, vendorIds: dto.vendorIds ?? [] }, actor);
    await this.audit.log({ actorId: actor.id, weddingId: e.weddingId, entity: 'WeddingEvent', entityId: e.id, action: 'create', message: `Added function "${e.name}"` });
    this.rt.toWedding(e.weddingId, 'function.updated', { id: e.id });
    return this.functionById(e.id);
  }

  async updateFunction(id: string, dto: UpdateFunctionDto, actor: AuthUser) {
    const prev = await this.prisma.weddingEvent.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Function not found');
    const start = dto.date ? new Date(dto.date) : prev.date;
    if (dto.endAt && new Date(dto.endAt) <= start) throw new BadRequestException('End time must be after the start time');
    await this.assertVendors(prev.weddingId, dto.vendorIds);
    const { weddingId: _w, endAt, notes, status, vendorIds, date, ...rest } = dto;
    const e = await this.prisma.weddingEvent.update({ where: { id }, data: { ...rest, ...(date ? { date: new Date(date) } : {}), ...(rest.name !== undefined ? { name: rest.name.trim() || prev.name } : {}) } });
    await this.saveMeta(id, { ...(endAt !== undefined ? { endAt } : {}), ...(notes !== undefined ? { notes } : {}), ...(status !== undefined ? { status } : {}), ...(vendorIds !== undefined ? { vendorIds } : {}) }, actor);
    await this.audit.log({ actorId: actor.id, weddingId: e.weddingId, entity: 'WeddingEvent', entityId: id, action: status && status !== undefined ? 'status' : 'update', message: status ? `Function "${e.name}" → ${status}` : `Updated function "${e.name}"` });
    this.rt.toWedding(e.weddingId, 'function.updated', { id });
    return this.functionById(id);
  }

  async deleteFunction(id: string, actor: AuthUser) {
    const e = await this.prisma.weddingEvent.delete({ where: { id } }).catch(() => { throw new NotFoundException('Function not found'); });
    await this.prisma.systemSetting.deleteMany({ where: { key: fnKey(id) } });
    await this.audit.log({ actorId: actor.id, weddingId: e.weddingId, entity: 'WeddingEvent', entityId: id, action: 'delete', message: `Removed function "${e.name}"` });
    this.rt.toWedding(e.weddingId, 'function.updated', { id, deleted: true });
    return { ok: true };
  }

  // ---------------------------------------------------------------- today
  private activeWeddings(start: Date, end: Date, weddingId?: string) {
    return this.prisma.wedding.findMany({
      where: { ...(weddingId ? { id: weddingId } : {}), status: { not: 'CANCELLED' }, OR: [{ startDate: { lt: end }, endDate: { gte: start } }, { events: { some: { date: { gte: start, lt: end } } } }] },
      select: { id: true, name: true, venue: true, location: true, status: true, startDate: true, endDate: true, expectedGuests: true, actualGuests: true }, orderBy: { startDate: 'asc' },
    });
  }

  async today(q: DayQuery, user: AuthUser) {
    const { start, end, date } = dayRange(q);
    const weddings = await this.activeWeddings(start, end);
    const ids = weddings.map((w) => w.id);
    const [events, timeline, arrivals, incidents, tasks, checkedIn] = await Promise.all([
      this.prisma.weddingEvent.findMany({ where: { weddingId: { in: ids }, date: { gte: start, lt: end } }, orderBy: { date: 'asc' }, include: { wedding: { select: { id: true, name: true, venue: true, location: true } } } }),
      this.prisma.timelineItem.findMany({ where: { weddingId: { in: ids }, scheduledAt: { gte: start, lt: end } }, orderBy: { scheduledAt: 'asc' }, include: { wedding: { select: { id: true, name: true } } } }),
      this.arrivalRows(ids, start, end),
      this.prisma.incident.findMany({ where: { weddingId: { in: ids }, status: { not: 'RESOLVED' } }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 20, include: { assignedTo: { select: { id: true, name: true } }, wedding: { select: { id: true, name: true } } } }),
      this.prisma.weddingTask.findMany({ where: { ownerId: user.id, status: { not: 'COMPLETED' }, dueDate: { lt: end } }, orderBy: { dueDate: 'asc' }, take: 15, select: { id: true, name: true, dueDate: true, priority: true, status: true, wedding: { select: { id: true, name: true } } } }),
      this.prisma.guest.aggregate({ where: { weddingId: { in: ids } }, _sum: { checkedInCount: true } }),
    ]);
    const functions = await this.shape(events);
    return { date, serverTime: new Date().toISOString(), weddings, functions, timeline, checkin: this.checkinCounts(arrivals), arrivals: arrivals.slice(0, 12), incidents, tasks, guestsCheckedIn: checkedIn._sum.checkedInCount ?? 0 };
  }

  // ---------------------------------------------------------------- vendor check-in
  private async arrivalRows(weddingIds: string[], start: Date, end: Date) {
    const rows = await this.prisma.weddingVendor.findMany({
      where: { weddingId: { in: weddingIds } }, orderBy: [{ weddingId: 'asc' }, { category: 'asc' }],
      include: { vendor: { select: { id: true, name: true, contactName: true, phone: true, category: true } }, arrival: true, wedding: { select: { id: true, name: true } } },
    });
    const now = Date.now();
    return rows
      // a tracked arrival on another day belongs to that day
      .filter((r) => !r.arrival || (r.arrival.expectedAt >= start && r.arrival.expectedAt < end) || r.arrival.status !== 'NOT_ARRIVED')
      .map((r) => {
        const bucket = arrivalBucket(r.arrival);
        const overdueMinutes = r.arrival && bucket === 'pending' && r.arrival.expectedAt.getTime() < now ? Math.round((now - r.arrival.expectedAt.getTime()) / 60000) : 0;
        return { id: r.id, weddingId: r.weddingId, wedding: r.wedding, category: r.category, vendor: r.vendor, arrival: r.arrival, bucket, overdueMinutes };
      });
  }
  private checkinCounts(rows: { bucket: ArrivalBucket; arrival: unknown }[]) {
    const c = { total: rows.length, expected: rows.filter((r) => r.arrival).length, arrived: 0, pending: 0, delayed: 0, completed: 0, untracked: rows.filter((r) => !r.arrival).length };
    rows.forEach((r) => { c[r.bucket]++; });
    return c;
  }

  async arrivals(q: ArrivalQuery) {
    const { start, end, date } = dayRange(q);
    const weddings = await this.activeWeddings(start, end, q.weddingId);
    const rows = await this.arrivalRows(weddings.map((w) => w.id), start, end);
    return { date, weddings: weddings.map((w) => ({ id: w.id, name: w.name })), counts: this.checkinCounts(rows), rows };
  }

  async notifyVendor(weddingVendorId: string, message: string | undefined, actor: AuthUser) {
    const wv = await this.prisma.weddingVendor.findUnique({ where: { id: weddingVendorId }, include: { vendor: true, wedding: { select: { id: true, name: true } }, arrival: true } });
    if (!wv) throw new NotFoundException('Vendor assignment not found');
    const users = await this.prisma.user.findMany({ where: { vendorId: wv.vendorId, status: UserStatus.ACTIVE }, select: { id: true } });
    const body = message?.trim() || `Please confirm your arrival for ${wv.wedding.name}${wv.arrival ? ` (expected ${wv.arrival.expectedAt.toISOString()})` : ''}.`;
    const notified = users.length ? await this.notif.notify({ type: 'vendor.reminder', title: 'Arrival reminder', body, link: '/vendor-portal/check-in', userIds: users.map((u) => u.id) }) : 0;
    await this.audit.log({ actorId: actor.id, weddingId: wv.weddingId, entity: 'VendorArrival', entityId: wv.arrival?.id ?? wv.id, action: 'notify', message: `Reminder sent to ${wv.vendor.name}${users.length ? '' : ' (no portal account, call instead)'}` });
    return { notified, portalUsers: users.length, phone: wv.arrival?.contactPhone ?? wv.vendor.phone };
  }

  // ---------------------------------------------------------------- incidents
  async incidents(q: IncidentQuery, user: AuthUser) {
    const where: Prisma.IncidentWhereInput = {
      ...(q.status ? { status: q.status } : {}), ...(q.severity ? { severity: q.severity } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}),
      ...(q.mine ? { assignedToId: user.id } : q.assignedToId ? { assignedToId: q.assignedToId } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.incident.findMany({ where, orderBy: orderBy(q, ['createdAt', 'severity', 'status'], 'createdAt'), ...skipTake(q), include: { assignedTo: { select: { id: true, name: true } }, wedding: { select: { id: true, name: true } } } }),
      this.prisma.incident.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }
  async incidentStats(weddingId?: string) {
    const g = await this.prisma.incident.groupBy({ by: ['status'], where: weddingId ? { weddingId } : {}, _count: true });
    const critical = await this.prisma.incident.count({ where: { ...(weddingId ? { weddingId } : {}), status: { not: 'RESOLVED' }, severity: { in: ['HIGH', 'CRITICAL'] } } });
    const n = (s: string) => g.find((x) => x.status === s)?._count ?? 0;
    return { open: n('OPEN'), inProgress: n('IN_PROGRESS'), resolved: n('RESOLVED'), highPriorityOpen: critical, total: g.reduce((s, x) => s + x._count, 0) };
  }

  // ---------------------------------------------------------------- calendar
  async calendar(q: CalendarQuery, user: AuthUser) {
    const from = new Date(q.from), to = new Date(q.to);
    if (to <= from || to.getTime() - from.getTime() > 93 * DAY) throw new BadRequestException('Range must be positive and at most 93 days');
    const [events, tasks] = await Promise.all([
      this.prisma.weddingEvent.findMany({ where: { date: { gte: from, lt: to }, ...(q.weddingId ? { weddingId: q.weddingId } : {}) }, orderBy: { date: 'asc' }, include: { wedding: { select: { id: true, name: true, venue: true, location: true } } } }),
      this.prisma.weddingTask.findMany({ where: { dueDate: { gte: from, lt: to }, ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.mine ? { ownerId: user.id } : {}) }, orderBy: { dueDate: 'asc' }, take: 500, select: { id: true, name: true, dueDate: true, status: true, priority: true, category: true, wedding: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } } }),
    ]);
    return { from: q.from, to: q.to, functions: await this.shape(events), tasks };
  }
}
