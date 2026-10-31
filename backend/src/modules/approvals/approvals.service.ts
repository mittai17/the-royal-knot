import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Approval, ApprovalState, ApprovalType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { inr } from '../../common/pdf-templates';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalQuery, CreateApprovalDto } from './approvals.dto';

const OPEN: ApprovalState[] = ['PENDING', 'IN_REVIEW'];
const include = {
  wedding: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, role: true } },
  decidedBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ApprovalInclude;

export interface ApprovalRequest { type: ApprovalType; title: string; description?: string; amount?: Prisma.Decimal.Value | null; weddingId?: string | null; entity?: string; entityId?: string }

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService) {}

  private tabWhere(tab?: string): Prisma.ApprovalWhereInput {
    switch (tab) {
      case 'pending': return { status: { in: OPEN } };
      case 'approved': return { status: 'APPROVED' };
      case 'rejected': return { status: 'REJECTED' };
      case 'history': return { status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] } };
      default: return {};
    }
  }

  async list(q: ApprovalQuery) {
    const where: Prisma.ApprovalWhereInput = {
      ...this.tabWhere(q.tab), ...(q.status ? { status: q.status } : {}), ...(q.type ? { type: q.type } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.approval.findMany({ where, include, orderBy: orderBy(q, ['createdAt', 'amount', 'decidedAt', 'title'], 'createdAt'), ...skipTake(q) }),
      this.prisma.approval.count({ where }),
    ]);
    const p = new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
    (p.meta as Record<string, unknown>).counts = await this.counts();
    return p;
  }

  async counts() {
    const g = await this.prisma.approval.groupBy({ by: ['status'], _count: true, _sum: { amount: true } });
    const n = (s: ApprovalState) => g.find((x) => x.status === s)?._count ?? 0;
    const pendingAmount = g.filter((x) => OPEN.includes(x.status)).reduce((a, x) => a + Number(x._sum.amount ?? 0), 0);
    return { pending: n('PENDING') + n('IN_REVIEW'), inReview: n('IN_REVIEW'), approved: n('APPROVED'), rejected: n('REJECTED'), cancelled: n('CANCELLED'), pendingAmount };
  }

  async get(id: string) {
    const a = await this.prisma.approval.findUnique({ where: { id }, include });
    if (!a) throw new NotFoundException('Approval not found');
    const history = await this.prisma.activityLog.findMany({ where: { entity: 'Approval', entityId: id }, orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true, role: true } } } });
    return { ...a, history };
  }

  /** Creates (or returns the already-open) approval for the same type + entity. Usable from other modules. */
  async requestFor(r: ApprovalRequest, actor: { id: string } | null, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    if (r.entity && r.entityId) {
      const open = await db.approval.findFirst({ where: { type: r.type, entity: r.entity, entityId: r.entityId, status: { in: OPEN } }, include });
      if (open) return open;
    }
    const a = await db.approval.create({ data: { type: r.type, title: r.title, description: r.description, amount: r.amount ?? undefined, weddingId: r.weddingId ?? undefined, entity: r.entity, entityId: r.entityId, requestedById: actor?.id }, include });
    await this.audit.log({ actorId: actor?.id, weddingId: a.weddingId, entity: 'Approval', entityId: a.id, action: 'request', message: `Requested approval: ${a.title}${a.amount ? ` (${inr(a.amount)})` : ''}`, meta: { type: a.type, entity: r.entity ?? null, entityId: r.entityId ?? null } }, tx);
    await this.notif.notify({ type: 'approval.requested', title: 'Approval needed', body: `${a.title}${a.amount ? ` · ${inr(a.amount)}` : ''}`, link: '/approvals', roles: [] }).catch(() => undefined);
    return a;
  }

  async create(dto: CreateApprovalDto, actor: AuthUser) {
    if (dto.weddingId && !(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    return this.requestFor(dto, actor);
  }

  async review(id: string, note: string | undefined, actor: AuthUser) {
    const a = await this.prisma.approval.updateMany({ where: { id, status: { in: OPEN } }, data: { status: 'IN_REVIEW', ...(note ? { decisionNote: note } : {}) } });
    if (!a.count) await this.explainNotOpen(id);
    const row = await this.prisma.approval.findUniqueOrThrow({ where: { id }, include });
    await this.audit.log({ actorId: actor.id, weddingId: row.weddingId, entity: 'Approval', entityId: id, action: 'review', message: `Marked in review: ${row.title}${note ? ` — ${note}` : ''}`, meta: { note: note ?? null } });
    return row;
  }

  async decide(id: string, state: 'APPROVED' | 'REJECTED', note: string | undefined, actor: AuthUser) {
    const row = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.approval.updateMany({ where: { id, status: { in: OPEN } }, data: { status: state, decidedById: actor.id, decidedAt: new Date(), ...(note ? { decisionNote: note } : {}) } });
      if (!claim.count) await this.explainNotOpen(id);
      const a = await tx.approval.findUniqueOrThrow({ where: { id }, include });
      if (a.entity === 'Expense' && a.entityId) await tx.expense.updateMany({ where: { id: a.entityId, status: 'PENDING' }, data: { status: state } });
      await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'Approval', entityId: id, action: state === 'APPROVED' ? 'approve' : 'reject', message: `${state === 'APPROVED' ? 'Approved' : 'Rejected'}: ${a.title}${note ? ` — ${note}` : ''}`, meta: { type: a.type, amount: a.amount?.toString() ?? null, note: note ?? null } }, tx);
      return a;
    });
    if (row.requestedById && row.requestedById !== actor.id) {
      await this.notif.notify({ type: 'approval.decided', title: `Request ${state === 'APPROVED' ? 'approved' : 'rejected'}`, body: row.title, link: '/approvals', userIds: [row.requestedById] }).catch(() => undefined);
    }
    return row;
  }

  async cancel(id: string, actor: AuthUser) {
    const a = await this.prisma.approval.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Approval not found');
    if (actor.role !== 'ADMIN' && a.requestedById !== actor.id) throw new ForbiddenException('Only the requester or a Founder can cancel this request');
    const c = await this.prisma.approval.updateMany({ where: { id, status: { in: OPEN } }, data: { status: 'CANCELLED', decidedById: actor.id, decidedAt: new Date() } });
    if (!c.count) await this.explainNotOpen(id);
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'Approval', entityId: id, action: 'cancel', message: `Cancelled request: ${a.title}` });
    return this.prisma.approval.findUniqueOrThrow({ where: { id }, include });
  }

  /** Keeps an open approval in step when the underlying record is decided elsewhere (e.g. Expenses screen). */
  async syncDecision(entity: string, entityId: string, state: 'APPROVED' | 'REJECTED', actorId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const open = await db.approval.findMany({ where: { entity, entityId, status: { in: OPEN } }, select: { id: true } });
    if (!open.length) return;
    await db.approval.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { status: state, decidedById: actorId, decidedAt: new Date(), decisionNote: 'Decided on the source record' } });
  }

  /** The most recent decided approval for a record, or null. */
  latestFor(entity: string, entityId: string, type?: ApprovalType): Promise<Approval | null> {
    return this.prisma.approval.findFirst({ where: { entity, entityId, ...(type ? { type } : {}) }, orderBy: { createdAt: 'desc' } });
  }

  private async explainNotOpen(id: string): Promise<never> {
    const cur = await this.prisma.approval.findUnique({ where: { id }, select: { status: true } });
    if (!cur) throw new NotFoundException('Approval not found');
    if (cur.status === 'CANCELLED' || cur.status === 'APPROVED' || cur.status === 'REJECTED') throw new ConflictException(`This request was already ${cur.status.toLowerCase()}`);
    throw new UnprocessableEntityException('This request can no longer be changed');
  }
}
