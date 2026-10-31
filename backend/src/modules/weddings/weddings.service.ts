import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventKind, Prisma, Role, WeddingStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, sum } from '../../common/finance';
import { syncMilestones } from '../../common/milestones';
import { Paginated } from '../../common/pagination';
import { G } from '../../common/permissions';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateWeddingDto, EventInputDto, UpdateWeddingDto, WeddingQuery } from './weddings.dto';

const DAY = 864e5;
const EVENT_NAMES: Record<EventKind, string> = { MEHENDI: 'Mehendi', SANGEET: 'Sangeet', CEREMONY: 'Wedding Ceremony', RECEPTION: 'Reception', HALDI: 'Haldi', OTHER: 'Event' };

@Injectable()
export class WeddingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  canSeeFinance(role: Role) { return role === Role.ADMIN || G.FINANCE_READ.includes(role); }

  /** Shared by POST /weddings and enquiry conversion. Creates couple, events and staged payment milestones atomically. */
  async createTx(tx: Prisma.TransactionClient, dto: CreateWeddingDto, extra: { enquiryId?: string } = {}) {
    let coupleId = dto.coupleId;
    if (!coupleId) {
      if (!dto.brideName || !dto.groomName) throw new BadRequestException('coupleId or brideName + groomName required');
      coupleId = (await tx.couple.create({ data: { brideName: dto.brideName, groomName: dto.groomName, phone: dto.phone, email: dto.email } })).id;
    }
    const couple = await tx.couple.findUniqueOrThrow({ where: { id: coupleId } });
    const start = new Date(dto.startDate);
    const days = dto.eventDays ?? 3;
    const end = dto.endDate ? new Date(dto.endDate) : new Date(start.getTime() + (days - 1) * DAY);
    const wedding = await tx.wedding.create({
      data: {
        name: dto.name ?? `${couple.groomName.trim().split(' ').pop()} Wedding`,
        coupleId, enquiryId: extra.enquiryId, location: dto.location, venue: dto.venue, startDate: start, endDate: end, eventDays: days,
        expectedGuests: dto.expectedGuests, packageType: dto.packageType, budget: dto.budget, contractValue: dto.contractValue, plannerId: dto.plannerId, theme: dto.theme,
      },
    });
    const kinds: EventKind[] = ['MEHENDI', 'SANGEET', 'CEREMONY', 'RECEPTION'];
    const events: EventInputDto[] = dto.events ?? kinds.slice(0, Math.max(1, Math.min(days + (days >= 3 ? 1 : 0), 4))).map((kind, i) => ({ kind, date: new Date(start.getTime() + Math.min(i, days - 1) * DAY).toISOString(), expectedGuests: dto.expectedGuests, venue: dto.venue }));
    for (const e of events) await tx.weddingEvent.create({ data: { weddingId: wedding.id, kind: e.kind, name: e.name ?? EVENT_NAMES[e.kind], date: new Date(e.date), venue: e.venue ?? dto.venue, expectedGuests: e.expectedGuests ?? dto.expectedGuests } });
    await syncMilestones(tx, wedding, dto.contractValue);
    return wedding;
  }

  async create(dto: CreateWeddingDto, actor: AuthUser) {
    const w = await this.prisma.$transaction((tx) => this.createTx(tx, dto));
    await this.audit.log({ actorId: actor.id, weddingId: w.id, entity: 'Wedding', entityId: w.id, action: 'create', message: `Created wedding ${w.name}` });
    return this.get(w.id, actor);
  }

  async list(q: WeddingQuery) {
    const where: Prisma.WeddingWhereInput = {
      ...(q.status ? { status: q.status } : {}), ...(q.packageType ? { packageType: q.packageType } : {}), ...(q.plannerId ? { plannerId: q.plannerId } : {}),
      ...(q.location ? { location: { contains: q.location, mode: 'insensitive' } } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { location: { contains: q.search, mode: 'insensitive' } }, { venue: { contains: q.search, mode: 'insensitive' } }, { couple: { OR: [{ brideName: { contains: q.search, mode: 'insensitive' } }, { groomName: { contains: q.search, mode: 'insensitive' } }] } }] } : {}),
    };
    const sortable = ['startDate', 'name', 'contractValue', 'budget', 'expectedGuests', 'createdAt'];
    const [rows, total] = await Promise.all([
      this.prisma.wedding.findMany({ where, orderBy: { [sortable.includes(q.sort ?? '') ? q.sort! : 'startDate']: q.order }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { couple: true, planner: { select: { id: true, name: true } } } }),
      this.prisma.wedding.count({ where }),
    ]);
    const progress = await this.progressFor(rows.map((r) => r.id));
    return new Paginated(rows.map((r) => ({ ...r, progress: progress[r.id] ?? 0 })), { page: q.page, pageSize: q.pageSize, total });
  }

  async progressFor(ids: string[]) {
    const g = await this.prisma.weddingTask.groupBy({ by: ['weddingId', 'status'], where: { weddingId: { in: ids } }, _count: true });
    const out: Record<string, number> = {};
    for (const id of ids) {
      const t = g.filter((x) => x.weddingId === id);
      const total = t.reduce((a, x) => a + x._count, 0);
      const done = t.filter((x) => x.status === 'COMPLETED').reduce((a, x) => a + x._count, 0);
      out[id] = total ? Math.round((done / total) * 100) : 0;
    }
    return out;
  }

  async get(id: string, user: AuthUser) {
    const w = await this.prisma.wedding.findUnique({ where: { id }, include: { couple: true, planner: { select: { id: true, name: true, email: true } }, events: { orderBy: { date: 'asc' } }, agreements: { select: { id: true, version: true, status: true, createdAt: true } } } });
    if (!w) throw new NotFoundException('Wedding not found');
    const [progress, counts, guestStats] = await Promise.all([
      this.progressFor([id]),
      this.prisma.$transaction([this.prisma.weddingTask.count({ where: { weddingId: id } }), this.prisma.weddingVendor.count({ where: { weddingId: id } }), this.prisma.guest.count({ where: { weddingId: id } }), this.prisma.incident.count({ where: { weddingId: id, status: { not: 'RESOLVED' } } }), this.prisma.document.count({ where: { weddingId: id } })]),
      this.prisma.guest.aggregate({ where: { weddingId: id, rsvp: 'YES' }, _count: true, _sum: { plusOnes: true } }),
    ]);
    let finance: unknown = undefined;
    if (this.canSeeFinance(user.role)) {
      const [pay, ms] = await Promise.all([this.prisma.clientPayment.aggregate({ where: { weddingId: id }, _sum: { amount: true } }), this.prisma.paymentMilestone.findMany({ where: { weddingId: id }, orderBy: { dueDate: 'asc' } })]);
      const received = D(pay._sum.amount);
      finance = { contractValue: w.contractValue, received, outstanding: D(w.contractValue).minus(received), milestones: ms };
    }
    return { ...w, progress: progress[id] ?? 0, counts: { tasks: counts[0], vendors: counts[1], guests: counts[2], openIncidents: counts[3], documents: counts[4] }, confirmedGuests: guestStats._count + (guestStats._sum.plusOnes ?? 0), finance };
  }

  async update(id: string, dto: UpdateWeddingDto, actor: AuthUser) {
    const prev = await this.prisma.wedding.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Wedding not found');
    const { brideName, groomName, phone, email, coupleId, events, startDate, endDate, ...rest } = dto;
    const w = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.wedding.update({ where: { id }, data: { ...rest, ...(startDate ? { startDate: new Date(startDate) } : {}), ...(endDate ? { endDate: new Date(endDate) } : {}) } });
      if (brideName || groomName || phone || email) await tx.couple.update({ where: { id: upd.coupleId }, data: { brideName, groomName, phone, email } });
      if (dto.contractValue !== undefined && !D(dto.contractValue).eq(prev.contractValue)) {
        const extras = await tx.additionalCharge.findMany({ where: { reconciliation: { weddingId: id }, approved: true, billToClient: true } });
        await syncMilestones(tx, upd, D(dto.contractValue), sum(extras.map((e) => e.amount)));
      }
      await this.audit.log({ actorId: actor.id, weddingId: id, entity: 'Wedding', entityId: id, action: 'update', message: `Updated wedding ${upd.name}`, meta: { fields: Object.keys(dto) } }, tx);
      return upd;
    });
    return this.get(w.id, actor);
  }

  async setStatus(id: string, status: WeddingStatus, actor: AuthUser) {
    const w = await this.prisma.wedding.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId: actor.id, weddingId: id, entity: 'Wedding', entityId: id, action: 'status', message: `Status → ${status}` });
    return w;
  }

  events(weddingId: string) { return this.prisma.weddingEvent.findMany({ where: { weddingId }, orderBy: { date: 'asc' } }); }
  addEvent(weddingId: string, e: { kind: EventKind; name?: string; date: string; venue?: string; expectedGuests?: number }) {
    return this.prisma.weddingEvent.create({ data: { weddingId, kind: e.kind, name: e.name ?? EVENT_NAMES[e.kind], date: new Date(e.date), venue: e.venue, expectedGuests: e.expectedGuests ?? 0 } });
  }

  async activity(weddingId: string, take = 100) {
    return this.prisma.activityLog.findMany({ where: { weddingId }, orderBy: { createdAt: 'desc' }, take, include: { actor: { select: { name: true, role: true } } } });
  }

  async couples(search?: string) {
    return this.prisma.couple.findMany({ where: search ? { OR: [{ brideName: { contains: search, mode: 'insensitive' } }, { groomName: { contains: search, mode: 'insensitive' } }] } : {}, take: 50, orderBy: { createdAt: 'desc' }, include: { weddings: { select: { id: true, name: true } } } });
  }
  async couple(id: string) {
    const c = await this.prisma.couple.findUnique({ where: { id }, include: { weddings: true, enquiries: true } });
    if (!c) throw new NotFoundException('Couple not found');
    return c;
  }
  updateCouple(id: string, data: { brideName?: string; groomName?: string; phone?: string; email?: string; address?: string }) { return this.prisma.couple.update({ where: { id }, data }); }
}
