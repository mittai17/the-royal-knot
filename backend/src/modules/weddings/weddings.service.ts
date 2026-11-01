import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, EventKind, ExecutionStage, Prisma, Role, WeddingStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, sum } from '../../common/finance';
import { syncMilestones } from '../../common/milestones';
import { Paginated } from '../../common/pagination';
import { G } from '../../common/permissions';
import { PrismaService } from '../../database/prisma.service';
import { ScopeService } from '../../common/scope.service';
import { BookingFacts, confirmationBlockers, confirmedWeddingWhere, deriveBookingStatus, draftWeddingWhere, legacyStatusFor, stageForLegacyStatus } from '../../common/booking';
import { assertTransition, BOOKING_TRANSITIONS } from '../../common/state-machines';
import { AuditService } from '../audit/audit.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateWeddingDto, EventInputDto, UpdateWeddingDto, WeddingQuery } from './weddings.dto';

const DAY = 864e5;
const EVENT_NAMES: Record<EventKind, string> = { MEHENDI: 'Mehendi', SANGEET: 'Sangeet', CEREMONY: 'Wedding Ceremony', RECEPTION: 'Reception', HALDI: 'Haldi', OTHER: 'Event' };

@Injectable()
export class WeddingsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private scope: ScopeService, private tasks: TasksService) {}

  /** Vendors must not see the commercial terms between the planner and the couple. */
  private redact<T extends Record<string, unknown>>(w: T, u: AuthUser): T {
    if (u.role !== Role.VENDOR) return w;
    const { budget: _b, contractValue: _c, ...rest } = w as Record<string, unknown>;
    return rest as T;
  }

  canSeeFinance(role: Role) { return role === Role.FOUNDER || G.FINANCE_READ.includes(role); }

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
        // every new workspace is an internal DRAFT; it becomes a booking only through confirm()
        bookingStatus: BookingStatus.DRAFT, executionStage: ExecutionStage.INITIAL_PHASE, status: WeddingStatus.PLANNING,
      },
    });
    const kinds: EventKind[] = ['MEHENDI', 'SANGEET', 'CEREMONY', 'RECEPTION'];
    const events: EventInputDto[] = dto.events ?? kinds.slice(0, Math.max(1, Math.min(days + (days >= 3 ? 1 : 0), 4))).map((kind, i) => ({ kind, date: new Date(start.getTime() + Math.min(i, days - 1) * DAY).toISOString(), expectedGuests: dto.expectedGuests, venue: dto.venue }));
    for (const e of events) await tx.weddingEvent.create({ data: { weddingId: wedding.id, kind: e.kind, name: e.name ?? EVENT_NAMES[e.kind], date: new Date(e.date), venue: e.venue ?? dto.venue, expectedGuests: e.expectedGuests ?? dto.expectedGuests } });
    await syncMilestones(tx, wedding, dto.contractValue);
    return wedding;
  }

  async create(dto: CreateWeddingDto, actor: AuthUser) {
    // a planner who opens a workspace is assigned to it (staff only see weddings they are assigned to)
    const withPlanner = { ...dto, plannerId: dto.plannerId ?? (actor.role === Role.PLANNER ? actor.id : undefined) };
    const w = await this.prisma.$transaction((tx) => this.createTx(tx, withPlanner));
    await this.audit.log({ actorId: actor.id, weddingId: w.id, entity: 'Wedding', entityId: w.id, action: 'create', message: `Created wedding ${w.name}` });
    return this.get(w.id, actor);
  }

  /** Derived UI tabs (booking status and execution stage stay separate fields). */
  static viewWhere(view: NonNullable<WeddingQuery['view']>): Prisma.WeddingWhereInput {
    switch (view) {
      case 'drafts': return draftWeddingWhere();
      case 'confirmed': return confirmedWeddingWhere();
      case 'planning': return { bookingStatus: { not: BookingStatus.CANCELLED }, executionStage: { in: [ExecutionStage.INITIAL_PHASE, ExecutionStage.VENDOR_BOOKING, ExecutionStage.PLANNING] } };
      case 'in_progress': return { ...confirmedWeddingWhere(), executionStage: { in: [ExecutionStage.EVENT_DAY, ExecutionStage.FINANCIAL_CLOSEOUT] } };
      case 'completed': return { ...confirmedWeddingWhere(), executionStage: ExecutionStage.COMPLETED };
      case 'cancelled': return { bookingStatus: BookingStatus.CANCELLED };
      default: return {};
    }
  }

  async list(q: WeddingQuery, user?: AuthUser) {
    const and: Prisma.WeddingWhereInput[] = [];
    if (user) and.push(this.scope.weddingWhere(user)); // CLIENT own, VENDOR booked, staff assigned
    if (q.view && q.view !== 'all') and.push(WeddingsService.viewWhere(q.view));
    if (q.search) and.push({ OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { location: { contains: q.search, mode: 'insensitive' } }, { venue: { contains: q.search, mode: 'insensitive' } }, { couple: { OR: [{ brideName: { contains: q.search, mode: 'insensitive' } }, { groomName: { contains: q.search, mode: 'insensitive' } }] } }] });
    const where: Prisma.WeddingWhereInput = {
      AND: and,
      ...(q.status ? { status: q.status } : {}), ...(q.bookingStatus ? { bookingStatus: q.bookingStatus } : {}), ...(q.executionStage ? { executionStage: q.executionStage } : {}),
      ...(q.packageType ? { packageType: q.packageType } : {}), ...(q.plannerId ? { plannerId: q.plannerId } : {}),
      ...(q.location ? { location: { contains: q.location, mode: 'insensitive' } } : {}),
    };
    const sortable = ['startDate', 'name', 'contractValue', 'budget', 'expectedGuests', 'createdAt'];
    const [rows, total] = await Promise.all([
      this.prisma.wedding.findMany({ where, orderBy: { [sortable.includes(q.sort ?? '') ? q.sort! : 'startDate']: q.order }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { couple: true, planner: { select: { id: true, name: true } } } }),
      this.prisma.wedding.count({ where }),
    ]);
    const progress = await this.progressFor(rows.map((r) => r.id));
    return new Paginated(rows.map((r) => this.redact({ ...r, progress: progress[r.id] ?? 0 }, user ?? ({ role: Role.FOUNDER } as AuthUser))), { page: q.page, pageSize: q.pageSize, total });
  }

  async progressFor(ids: string[]) {
    const g = await this.prisma.weddingTask.groupBy({ by: ['weddingId', 'status'], where: { weddingId: { in: ids } }, _count: true });
    const out: Record<string, number> = {};
    for (const id of ids) {
      const t = g.filter((x) => x.weddingId === id);
      const total = t.reduce((a, x) => a + x._count, 0);
      const done = t.filter((x) => x.status === 'DONE').reduce((a, x) => a + x._count, 0);
      out[id] = total ? Math.round((done / total) * 100) : 0;
    }
    return out;
  }

  async get(id: string, user: AuthUser) {
    await this.scope.assertWeddingAccess(user, id);
    const w = await this.prisma.wedding.findUnique({ where: { id }, include: { couple: true, planner: { select: { id: true, name: true, email: true } }, events: { orderBy: { date: 'asc' } }, agreements: { select: { id: true, version: true, status: true, createdAt: true } } } });
    if (!w) throw new NotFoundException('Wedding not found');
    const [progress, counts, guestStats] = await Promise.all([
      this.progressFor([id]),
      this.prisma.$transaction([this.prisma.weddingTask.count({ where: { weddingId: id } }), this.prisma.weddingVendor.count({ where: { weddingId: id } }), this.prisma.guest.count({ where: { weddingId: id } }), this.prisma.incident.count({ where: { weddingId: id, status: { notIn: ['RESOLVED', 'CLOSED'] } } }), this.prisma.document.count({ where: { weddingId: id } })]),
      this.prisma.guest.aggregate({ where: { weddingId: id, rsvp: 'CONFIRMED' }, _count: true, _sum: { plusOnes: true } }),
    ]);
    let finance: unknown = undefined;
    if (this.canSeeFinance(user.role)) {
      const [pay, ms] = await Promise.all([this.prisma.clientPayment.aggregate({ where: { weddingId: id }, _sum: { amount: true } }), this.prisma.paymentMilestone.findMany({ where: { weddingId: id }, orderBy: { dueDate: 'asc' } })]);
      const received = D(pay._sum.amount);
      finance = { contractValue: w.contractValue, received, outstanding: D(w.contractValue).minus(received), milestones: ms };
    }
    const readiness = user.role === Role.CLIENT || user.role === Role.VENDOR ? undefined : await this.readiness(id);
    return this.redact({ ...w, readiness, progress: progress[id] ?? 0, counts: { tasks: counts[0], vendors: counts[1], guests: counts[2], openIncidents: counts[3], documents: counts[4] }, confirmedGuests: guestStats._count + (guestStats._sum.plusOnes ?? 0), finance }, user);
  }

  async update(id: string, dto: UpdateWeddingDto, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, id);
    const prev = await this.prisma.wedding.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Wedding not found');
    const { brideName, groomName, phone, email, coupleId, events, startDate, endDate, status, ...rest } = dto;
    if (status && status !== prev.status) await this.applyLegacyStatus(prev, status); // validates before anything is written
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

  /** Legacy status endpoint. Maps onto executionStage / bookingStatus and keeps Wedding.status in sync; it can never confirm a booking. */
  async setStatus(id: string, status: WeddingStatus, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, id);
    const w = await this.prisma.wedding.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('Wedding not found');
    const updated = await this.applyLegacyStatus(w, status);
    await this.audit.log({ actorId: actor.id, weddingId: id, entity: 'Wedding', entityId: id, action: 'status', message: `Status → ${status}` });
    return updated;
  }

  private async applyLegacyStatus(w: { id: string; bookingStatus: BookingStatus; executionStage: ExecutionStage; status: WeddingStatus }, status: WeddingStatus) {
    if (status === 'CANCELLED') {
      assertTransition('Wedding booking', BOOKING_TRANSITIONS, w.bookingStatus, BookingStatus.CANCELLED, { allowSame: true });
      return this.prisma.wedding.update({ where: { id: w.id }, data: { bookingStatus: BookingStatus.CANCELLED, status: 'CANCELLED' } });
    }
    if (w.bookingStatus === 'CANCELLED') throw new ConflictException('A cancelled wedding cannot change stage');
    const stage = stageForLegacyStatus(status);
    if (!stage) throw new BadRequestException(`Unsupported status ${status}`);
    // event day / closeout / completed only make sense for a confirmed booking
    const late = stage === ExecutionStage.EVENT_DAY || stage === ExecutionStage.COMPLETED || stage === ExecutionStage.FINANCIAL_CLOSEOUT;
    if (late && w.bookingStatus !== 'CONFIRMED') throw new ConflictException({ message: 'Confirm the booking (agreement signed, proposal accepted, deposit verified) before moving past planning', code: 'BOOKING_NOT_CONFIRMED' });
    return this.prisma.wedding.update({ where: { id: w.id }, data: { executionStage: stage, status: legacyStatusFor(w.bookingStatus, stage) } });
  }

  // ---- draft vs confirmed (master spec decision 3) ----

  /** The facts behind the booking status. Reads only; also treats a SENT proposal whose agreement is SIGNED as accepted. */
  async facts(weddingId: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<BookingFacts & { finalProposalId: string | null; syncProposal?: { id: string; at: Date } }> {
    const [agreements, proposals, booking] = await Promise.all([
      db.agreement.findMany({ where: { weddingId }, select: { id: true, status: true, signatures: { select: { signedAt: true }, orderBy: { signedAt: 'desc' }, take: 1 } } }),
      db.proposal.findMany({ where: { weddingId, status: { in: ['SENT', 'VIEWED', 'ACCEPTED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, agreementId: true } }),
      db.paymentMilestone.findUnique({ where: { weddingId_type: { weddingId, type: 'BOOKING' } }, select: { id: true, expectedAmount: true } }),
    ]);
    const agreementSigned = agreements.some((a) => a.status === 'SIGNED');
    const final = proposals[0] ?? null; // the latest live proposal is the final one
    let proposalAccepted = final?.status === 'ACCEPTED';
    let syncProposal: { id: string; at: Date } | undefined;
    if (final && !proposalAccepted && final.agreementId) {
      const ag = agreements.find((a) => a.id === final.agreementId);
      if (ag?.status === 'SIGNED') { proposalAccepted = true; syncProposal = { id: final.id, at: ag.signatures[0]?.signedAt ?? new Date() }; }
    }
    let depositVerified = false;
    if (booking) {
      const rows = await db.clientPayment.findMany({ where: { weddingId, milestoneId: booking.id, status: 'SUCCEEDED', verifiedAt: { not: null }, reversalOfId: null, reversedAt: null }, select: { amount: true } });
      depositVerified = rows.length > 0 && sum(rows.map((r) => r.amount)).gte(D(booking.expectedAmount));
    }
    return { agreementSent: agreements.length > 0, agreementSigned, proposalAccepted, depositVerified, finalProposalId: final?.id ?? null, syncProposal };
  }

  async readiness(weddingId: string) {
    const f = await this.facts(weddingId);
    const blockers = confirmationBlockers(f);
    return { agreementSigned: f.agreementSigned, proposalAccepted: f.proposalAccepted, depositVerified: f.depositVerified, ready: blockers.length === 0, blockers };
  }

  /**
   * Recomputes bookingStatus from the facts (AGREEMENT_PENDING -> PROPOSAL_PENDING -> DEPOSIT_PENDING). Never confirms and never demotes
   * CONFIRMED / CANCELLED weddings. Call after agreement, proposal or payment changes.
   */
  async refreshBookingStatus(weddingId: string) {
    const w = await this.prisma.wedding.findUnique({ where: { id: weddingId }, select: { id: true, bookingStatus: true } });
    if (!w) throw new NotFoundException('Wedding not found');
    const f = await this.facts(weddingId);
    if (f.syncProposal) await this.prisma.proposal.updateMany({ where: { id: f.syncProposal.id, status: { in: ['SENT', 'VIEWED'] } }, data: { status: 'ACCEPTED', respondedAt: f.syncProposal.at } });
    const next = deriveBookingStatus(w.bookingStatus, f);
    if (next !== w.bookingStatus) await this.prisma.wedding.updateMany({ where: { id: weddingId, bookingStatus: w.bookingStatus }, data: { bookingStatus: next } });
    return { bookingStatus: next, facts: f };
  }

  /**
   * The single confirmation guard. Allowed only when the agreement is SIGNED, the final proposal ACCEPTED and the booking deposit
   * verified (ClientPayment SUCCEEDED with verifiedAt on the BOOKING milestone). Idempotent: a repeat call is a no-op that creates
   * no second set of tasks. Planning tasks are generated here and nowhere before.
   */
  async confirm(id: string, actor?: AuthUser) {
    const r = await this.tryConfirm(id, actor);
    if (!r.confirmed) throw new ConflictException({ message: `Cannot confirm yet: ${r.blockers.join(', ')}`, code: 'CONFIRMATION_BLOCKED', blockers: r.blockers });
    return r;
  }

  /** Same as confirm() but returns `{confirmed:false, blockers}` instead of throwing; used by hooks (payment verified, agreement signed...). */
  async confirmIfReady(id: string, actor?: AuthUser) {
    return this.tryConfirm(id, actor);
  }

  private async tryConfirm(id: string, actor?: AuthUser) {
    const exists = await this.prisma.wedding.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Wedding not found');
    const sync = await this.refreshBookingStatus(id); // persists proposal acceptance derived from a signed agreement
    void sync;
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Wedding" WHERE id = ${id} FOR UPDATE`; // serialise concurrent confirmations
      const w = await tx.wedding.findUniqueOrThrow({ where: { id } });
      if (w.bookingStatus === 'CANCELLED') throw new ConflictException('A cancelled wedding cannot be confirmed');
      if (w.bookingStatus === 'CONFIRMED') return { confirmed: true as const, alreadyConfirmed: true, blockers: [] as string[], wedding: w };
      const f = await this.facts(id, tx);
      const blockers = confirmationBlockers(f);
      if (blockers.length) {
        const next = deriveBookingStatus(w.bookingStatus, f);
        const wd = next !== w.bookingStatus ? await tx.wedding.update({ where: { id }, data: { bookingStatus: next } }) : w;
        return { confirmed: false as const, alreadyConfirmed: false, blockers, wedding: wd };
      }
      const stage = w.executionStage === ExecutionStage.INITIAL_PHASE ? (w.packageType === 'FULL_SERVICE' ? ExecutionStage.VENDOR_BOOKING : ExecutionStage.PLANNING) : w.executionStage;
      const wd = await tx.wedding.update({
        where: { id },
        data: {
          bookingStatus: BookingStatus.CONFIRMED, executionStage: stage, status: legacyStatusFor(BookingStatus.CONFIRMED, stage),
          ...(w.financialStatus === 'NOT_STARTED' || w.financialStatus === 'DEPOSIT_PENDING' ? { financialStatus: 'PARTIALLY_PAID' as const } : {}),
        },
      });
      await this.audit.log({ actorId: actor?.id, weddingId: id, entity: 'Wedding', entityId: id, action: 'confirm', message: `Booking confirmed for ${wd.name} (agreement signed, proposal accepted, deposit verified)` }, tx);
      return { confirmed: true as const, alreadyConfirmed: false, blockers: [] as string[], wedding: wd };
    });
    let tasks: Awaited<ReturnType<TasksService['generate']>> | null = null;
    if (out.confirmed) {
      // idempotent (unique weddingId+templateKey); on a repeat call only heals a generation that failed after the first commit
      const have = out.alreadyConfirmed ? await this.prisma.weddingTask.count({ where: { weddingId: id } }) : 0;
      if (!out.alreadyConfirmed || have === 0) tasks = await this.tasks.generate(id, {}).catch(() => null); // system call: confirmation may be triggered by a client or finance user who has no task scope
    }
    return { confirmed: out.confirmed, alreadyConfirmed: out.alreadyConfirmed, blockers: out.blockers, weddingId: id, bookingStatus: out.wedding.bookingStatus, executionStage: out.wedding.executionStage, status: out.wedding.status, tasks };
  }

  /**
   * Staff assignment helper. PLANNER -> Wedding.plannerId; EVENT_MANAGER / OPERATIONS -> takes over the open planning tasks of their role
   * (task ownership is what grants access, see ScopeService). Returns how many tasks changed hands.
   */
  async assignStaff(weddingId: string, userId: string, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    const [w, user] = await Promise.all([this.prisma.wedding.findUnique({ where: { id: weddingId }, select: { id: true, plannerId: true } }), this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, name: true } })]);
    if (!w) throw new NotFoundException('Wedding not found');
    if (!user || user.status !== 'ACTIVE') throw new NotFoundException('User not found');
    let reassigned = 0;
    if (user.role === Role.PLANNER) await this.prisma.wedding.update({ where: { id: weddingId }, data: { plannerId: userId } });
    else if (user.role === Role.EVENT_MANAGER || user.role === Role.OPERATIONS) {
      const r = await this.prisma.weddingTask.updateMany({ where: { weddingId, status: { not: 'DONE' }, owner: { role: user.role } }, data: { ownerId: userId } });
      reassigned = r.count;
    } else throw new BadRequestException('Only planners, event managers and operations staff can be assigned to a wedding');
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'Wedding', entityId: weddingId, action: 'assign', message: `Assigned ${user.name} (${user.role.toLowerCase()}) to the wedding`, meta: { userId, reassigned } });
    return { weddingId, userId, role: user.role, reassignedTasks: reassigned };
  }

  async events(weddingId: string, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    return this.eventsOf(weddingId);
  }
  private eventsOf(weddingId: string) { return this.prisma.weddingEvent.findMany({ where: { weddingId }, orderBy: { date: 'asc' } }); }
  async addEvent(weddingId: string, e: { kind: EventKind; name?: string; date: string; venue?: string; expectedGuests?: number }, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    return this.prisma.weddingEvent.create({ data: { weddingId, kind: e.kind, name: e.name ?? EVENT_NAMES[e.kind], date: new Date(e.date), venue: e.venue, expectedGuests: e.expectedGuests ?? 0 } });
  }

  async activity(weddingId: string, take = 100, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
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
