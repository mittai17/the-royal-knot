import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EnquiryStage, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D } from '../../common/finance';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { assertTransition, ENQUIRY_TRANSITIONS } from '../../common/state-machines';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WeddingsService } from '../weddings/weddings.service';
import { ConvertEnquiryDto, CreateEnquiryDto, EnquiryQuery, UpdateEnquiryDto } from './enquiries.dto';

const include = { couple: true, assignedTo: { select: { id: true, name: true } } } satisfies Prisma.EnquiryInclude;

@Injectable()
export class EnquiriesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private weddings: WeddingsService) {}

  async create(dto: CreateEnquiryDto, actor: AuthUser) {
    const { brideName, groomName, phone, email, preferredDate, followUpAt, assignedToId: _assignee, ...rest } = dto;
    const assignee = dto.assignedToId ?? (actor.role === 'PLANNER' ? actor.id : undefined);
    const e = await this.prisma.enquiry.create({
      data: { ...rest, assignedTo: assignee ? { connect: { id: assignee } } : undefined, preferredDate: preferredDate ? new Date(preferredDate) : undefined, followUpAt: followUpAt ? new Date(followUpAt) : undefined, couple: { create: { brideName, groomName, phone, email } }, activities: { create: { type: 'created', actorId: actor.id, message: `Enquiry captured via ${dto.source.toLowerCase()}` } } },
      include,
    });
    await this.notif.notify({ type: 'enquiry.new', title: 'New enquiry', body: `${brideName} & ${groomName}${dto.location ? ` · ${dto.location}` : ''}`, link: `/enquiries/${e.id}`, roles: ['PLANNER'], ...(e.assignedToId ? { userIds: [e.assignedToId] } : {}) });
    await this.audit.log({ actorId: actor.id, entity: 'Enquiry', entityId: e.id, action: 'create', message: `New enquiry ${brideName} & ${groomName}` });
    return e;
  }

  async list(q: EnquiryQuery) {
    const where: Prisma.EnquiryWhereInput = {
      ...(q.stage ? { stage: q.stage } : {}), ...(q.source ? { source: q.source } : {}), ...(q.assignedToId ? { assignedToId: q.assignedToId } : {}),
      ...(q.followUpDue ? { followUpAt: { lte: new Date() }, stage: { notIn: ['CONVERTED', 'LOST'] } } : {}),
      ...(q.search ? { OR: [{ location: { contains: q.search, mode: 'insensitive' } }, { notes: { contains: q.search, mode: 'insensitive' } }, { couple: { OR: [{ brideName: { contains: q.search, mode: 'insensitive' } }, { groomName: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }] } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.enquiry.findMany({ where, include, orderBy: orderBy(q, ['createdAt', 'preferredDate', 'budget', 'followUpAt', 'stage', 'guestCount'], 'createdAt'), ...skipTake(q) }),
      this.prisma.enquiry.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  async pipeline() {
    const g = await this.prisma.enquiry.groupBy({ by: ['stage'], _count: true, _sum: { budget: true } });
    const due = await this.prisma.enquiry.count({ where: { followUpAt: { lte: new Date() }, stage: { notIn: ['CONVERTED', 'LOST'] } } });
    return { stages: Object.values(EnquiryStage).map((s) => ({ stage: s, count: g.find((x) => x.stage === s)?._count ?? 0, budget: g.find((x) => x.stage === s)?._sum.budget ?? 0 })), followUpsDue: due };
  }

  async get(id: string) {
    const e = await this.prisma.enquiry.findUnique({ where: { id }, include: { ...include, activities: { orderBy: { createdAt: 'desc' } } } });
    if (!e) throw new NotFoundException('Enquiry not found');
    return e;
  }

  async update(id: string, dto: UpdateEnquiryDto, actor: AuthUser) {
    const prev = await this.get(id);
    if (prev.convertedWeddingId && dto.stage && dto.stage !== 'CONVERTED') throw new ConflictException('Converted enquiries stay Confirmed');
    if (dto.stage === 'CONVERTED' && !prev.convertedWeddingId) throw new BadRequestException('Use the convert action to confirm an enquiry — it creates the wedding');
    if (dto.stage) assertTransition('Enquiry', ENQUIRY_TRANSITIONS, prev.stage, dto.stage, { allowSame: true });
    const { brideName, groomName, phone, email, preferredDate, followUpAt, assignedToId, ...rest } = dto;
    const acts: { type: string; message: string }[] = [];
    if (dto.stage && dto.stage !== prev.stage) acts.push({ type: 'stage', message: `Stage ${prev.stage} → ${dto.stage}${dto.lostReason ? ` (${dto.lostReason})` : ''}` });
    if (dto.assignedToId && dto.assignedToId !== prev.assignedToId) { const u = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } }); acts.push({ type: 'assigned', message: `Assigned to ${u?.name}` }); }
    if (followUpAt) acts.push({ type: 'follow_up', message: `Follow-up set for ${new Date(followUpAt).toDateString()}` });
    const e = await this.prisma.enquiry.update({
      where: { id },
      data: { ...rest, ...(assignedToId ? { assignedTo: { connect: { id: assignedToId } } } : {}), ...(preferredDate ? { preferredDate: new Date(preferredDate) } : {}), ...(followUpAt ? { followUpAt: new Date(followUpAt) } : {}), ...(brideName || groomName || phone || email ? { couple: { update: { brideName, groomName, phone, email } } } : {}), ...(acts.length ? { activities: { create: acts.map((a) => ({ ...a, actorId: actor.id })) } } : {}) },
      include,
    });
    if (dto.assignedToId && dto.assignedToId !== prev.assignedToId && dto.assignedToId !== actor.id) await this.notif.notify({ type: 'enquiry.assigned', title: 'Enquiry assigned to you', body: `${e.couple.brideName} & ${e.couple.groomName}`, link: `/enquiries/${id}`, userIds: [dto.assignedToId], roles: [] });
    await this.audit.log({ actorId: actor.id, entity: 'Enquiry', entityId: id, action: 'update', message: acts.map((a) => a.message).join('; ') || 'Enquiry updated' });
    return e;
  }

  addActivity(id: string, message: string, type = 'note', actor: AuthUser) {
    return this.prisma.enquiryActivity.create({ data: { enquiryId: id, actorId: actor.id, type, message } });
  }

  /**
   * Atomically creates the wedding workspace (+couple link, events, milestones) and closes the lead as CONVERTED.
   * The wedding is a DRAFT (bookingStatus DRAFT, executionStage INITIAL_PHASE): not a booking, not counted in revenue or stats, no tasks yet.
   * It becomes CONFIRMED only through WeddingsService.confirm().
   */
  async convert(id: string, dto: ConvertEnquiryDto, actor: AuthUser) {
    const e = await this.get(id);
    if (e.convertedWeddingId) throw new ConflictException('Enquiry already converted');
    if (e.stage === 'LOST') throw new BadRequestException('Reopen a lost enquiry before converting it');
    if (e.stage === 'CONVERTED') throw new ConflictException('Enquiry already converted');
    const start = dto.startDate ?? e.preferredDate?.toISOString();
    if (!start) throw new BadRequestException('startDate is required (enquiry has no preferred date)');
    const wedding = await this.prisma.$transaction(async (tx) => {
      const w = await this.weddings.createTx(tx, {
        coupleId: e.coupleId, name: dto.name, location: e.location ?? 'TBD', venue: dto.venue, startDate: start, endDate: dto.endDate, eventDays: dto.eventDays,
        expectedGuests: dto.expectedGuests ?? e.guestCount ?? 0, packageType: e.packageType, budget: D(e.budget).toNumber(), contractValue: dto.contractValue ?? D(e.budget).toNumber(),
        plannerId: dto.plannerId ?? e.assignedToId ?? actor.id, theme: e.theme ?? undefined,
      }, { enquiryId: e.id });
      await tx.enquiry.update({ where: { id }, data: { stage: 'CONVERTED', convertedWeddingId: w.id, activities: { create: { type: 'converted', actorId: actor.id, message: `Converted to wedding "${w.name}"` } } } });
      await this.audit.log({ actorId: actor.id, weddingId: w.id, entity: 'Enquiry', entityId: id, action: 'convert', message: `Enquiry converted to wedding ${w.name}` }, tx);
      return w;
    });
    return this.weddings.get(wedding.id, actor);
  }
}
