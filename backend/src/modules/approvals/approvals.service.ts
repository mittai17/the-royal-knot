import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Approval, ApprovalState, ApprovalType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, money, sum } from '../../common/finance';
import { assertDifferentPerson, creatorOf } from '../../common/finance-policy';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { inr } from '../../common/pdf-templates';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalQuery, ApprovalSource, CreateApprovalDto } from './approvals.dto';

const OPEN: ApprovalState[] = ['PENDING', 'IN_REVIEW'];
const include = {
  wedding: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, role: true } },
  decidedBy: { select: { id: true, name: true, role: true } },
  assignedApprover: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ApprovalInclude;

export interface ApprovalRequest {
  type: ApprovalType; title: string; description?: string; amount?: Prisma.Decimal.Value | null; weddingId?: string | null; entity?: string; entityId?: string;
  reason?: string; supportingDocumentId?: string | null; assignedApproverId?: string | null; sourceModule?: string; sourceId?: string;
}

/** Source module -> ApprovalType, the record the request points at and how to check it exists. */
export const SOURCE_MAP: Record<ApprovalSource, { type: ApprovalType; module: string; entity?: string }> = {
  expense: { type: 'EXTRA_EXPENSE', module: 'expenses', entity: 'Expense' },
  'vendor-payment': { type: 'VENDOR_PAYMENT', module: 'vendor-payments', entity: 'VendorPayment' },
  'client-discount': { type: 'CLIENT_DISCOUNT', module: 'invoices', entity: 'ClientInvoice' },
  'budget-increase': { type: 'BUDGET_INCREASE', module: 'budgets', entity: 'Budget' },
  'client-refund': { type: 'OTHER', module: 'client-refund', entity: 'ClientPayment' },
  cancellation: { type: 'OTHER', module: 'cancellation', entity: 'Wedding' },
  'special-purchase': { type: 'OTHER', module: 'special-purchase', entity: 'PurchaseOrder' },
  'vendor-contract': { type: 'VENDOR_CONTRACT', module: 'procurement', entity: 'WeddingVendor' },
  other: { type: 'OTHER', module: 'other' },
};

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

  async list(q: ApprovalQuery, actor?: AuthUser) {
    const where: Prisma.ApprovalWhereInput = {
      ...this.tabWhere(q.tab), ...(q.status ? { status: q.status } : {}), ...(q.type ? { type: q.type } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.sourceModule ? { sourceModule: q.sourceModule } : {}),
      ...(actor && q.assignedToMe === 'true' ? { assignedApproverId: actor.id } : {}), ...(actor && q.requestedByMe === 'true' ? { requestedById: actor.id } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { reference: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
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
    const pendingAmount = money(sum(g.filter((x) => OPEN.includes(x.status)).map((x) => x._sum.amount)));
    return { pending: n('PENDING') + n('IN_REVIEW'), inReview: n('IN_REVIEW'), approved: n('APPROVED'), rejected: n('REJECTED'), cancelled: n('CANCELLED'), pendingAmount };
  }

  async get(id: string) {
    const a = await this.prisma.approval.findUnique({ where: { id }, include });
    if (!a) throw new NotFoundException('Approval not found');
    const history = await this.prisma.activityLog.findMany({ where: { entity: 'Approval', entityId: id }, orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true, role: true } } } });
    return { ...a, history };
  }

  /** Next human reference APR-<year>-NNNN. Call inside a transaction: the advisory lock serialises numbering. */
  private async nextReference(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('Approval.reference'))`;
    const year = new Date().getFullYear();
    const last = await tx.approval.findFirst({ where: { reference: { startsWith: `APR-${year}-` } }, orderBy: { reference: 'desc' }, select: { reference: true } });
    const n = last?.reference ? Number(last.reference.split('-')[2]) + 1 : 1;
    return `APR-${year}-${String(n).padStart(4, '0')}`;
  }

  /** The default decider: an explicit assignee, else the first active Founder who is not the requester. */
  private async pickApprover(db: Prisma.TransactionClient | PrismaServiceLike, requesterId?: string | null, assigned?: string | null) {
    if (assigned) return assigned;
    const f = await db.user.findFirst({ where: { role: 'FOUNDER', status: 'ACTIVE', ...(requesterId ? { id: { not: requesterId } } : {}) }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    return f?.id ?? null;
  }

  /** Creates (or returns the already-open) approval for the same type + entity. Usable from other modules; always fully populated (reference, source, assignee). */
  async requestFor(r: ApprovalRequest, actor: { id: string } | null, tx?: Prisma.TransactionClient): Promise<Prisma.ApprovalGetPayload<{ include: typeof include }>> {
    if (!tx) return this.prisma.$transaction((t) => this.requestFor(r, actor, t), { timeout: 15000 });
    const db = tx;
    if (r.entity && r.entityId) {
      const open = await db.approval.findFirst({ where: { type: r.type, entity: r.entity, entityId: r.entityId, status: { in: OPEN } }, include });
      if (open) return open;
    }
    const reference = await this.nextReference(db);
    const assignedApproverId = await this.pickApprover(db, actor?.id, r.assignedApproverId);
    const a = await db.approval.create({
      data: {
        reference, type: r.type, title: r.title, description: r.description, reason: r.reason ?? r.description, amount: r.amount == null ? undefined : money(D(r.amount)), weddingId: r.weddingId ?? undefined, entity: r.entity, entityId: r.entityId,
        sourceModule: r.sourceModule ?? (r.entity ? r.entity.toLowerCase() : undefined), sourceId: r.sourceId ?? r.entityId, supportingDocumentId: r.supportingDocumentId ?? undefined, assignedApproverId: assignedApproverId ?? undefined, requestedById: actor?.id,
      },
      include,
    });
    await this.audit.log({ actorId: actor?.id, weddingId: a.weddingId, entity: 'Approval', entityId: a.id, action: 'request', message: `Requested approval ${a.reference}: ${a.title}${a.amount ? ` (${inr(a.amount)})` : ''}`, meta: { type: a.type, reference: a.reference, entity: r.entity ?? null, entityId: r.entityId ?? null, sourceModule: a.sourceModule } }, tx);
    await this.notif.notify({ type: 'approval.requested', title: 'Approval needed', body: `${a.title}${a.amount ? ` · ${inr(a.amount)}` : ''}`, link: '/approvals', ...(a.assignedApproverId ? { userIds: [a.assignedApproverId] } : { roles: [] }) }).catch(() => undefined);
    return a;
  }

  /** Confirms the record an approval points at actually exists (so a request cannot dangle). */
  private async assertSource(entity: string | undefined, id: string | undefined) {
    if (!entity || !id) return;
    const q: Record<string, () => Promise<number>> = {
      Expense: () => this.prisma.expense.count({ where: { id } }), VendorPayment: () => this.prisma.vendorPayment.count({ where: { id } }), ClientInvoice: () => this.prisma.clientInvoice.count({ where: { id } }),
      Budget: () => this.prisma.budget.count({ where: { id } }), ClientPayment: () => this.prisma.clientPayment.count({ where: { id } }), Wedding: () => this.prisma.wedding.count({ where: { id } }),
      PurchaseOrder: () => this.prisma.purchaseOrder.count({ where: { id } }), WeddingVendor: () => this.prisma.weddingVendor.count({ where: { id } }),
    };
    if (!q[entity]) return;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !(await q[entity]())) throw new NotFoundException(`${entity} ${id} not found`);
  }

  async create(dto: CreateApprovalDto, actor: AuthUser) {
    if (!dto.source && !dto.type) throw new BadRequestException('Give either `source` or `type`');
    const src = dto.source ? SOURCE_MAP[dto.source] : null;
    const type = src?.type ?? dto.type!;
    const entity = dto.entity ?? src?.entity;
    const entityId = dto.entityId;
    if (src && src.entity && src.module !== 'other' && !entityId) throw new BadRequestException(`A ${dto.source} request must point at its record (entityId)`);
    if (dto.weddingId && !(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    await this.assertSource(entity, entityId);
    if (dto.assignedApproverId && !(await this.prisma.user.count({ where: { id: dto.assignedApproverId, role: { in: ['FOUNDER', 'FINANCE'] } } }))) throw new BadRequestException('The approver must be a Founder or Finance user');
    return this.requestFor({ type, title: dto.title, description: dto.description, reason: dto.reason, amount: dto.amount, weddingId: dto.weddingId, entity, entityId, sourceModule: src?.module ?? entity?.toLowerCase(), sourceId: entityId, supportingDocumentId: dto.supportingDocumentId, assignedApproverId: dto.assignedApproverId }, actor);
  }

  async review(id: string, note: string | undefined, actor: AuthUser) {
    const a = await this.prisma.approval.updateMany({ where: { id, status: { in: OPEN } }, data: { status: 'IN_REVIEW', ...(note ? { decisionNote: note } : {}) } });
    if (!a.count) await this.explainNotOpen(id);
    const row = await this.prisma.approval.findUniqueOrThrow({ where: { id }, include });
    await this.audit.log({ actorId: actor.id, weddingId: row.weddingId, entity: 'Approval', entityId: id, action: 'review', message: `Marked in review: ${row.title}${note ? ` — ${note}` : ''}`, meta: { note: note ?? null } });
    return row;
  }

  /**
   * Maker-checker: nobody decides a request they raised (the Founder included). Decisions are applied to the source record inside the same
   * transaction (expense, vendor payment), so an approval and the thing it unlocks can never disagree.
   */
  async decide(id: string, state: 'APPROVED' | 'REJECTED', note: string | undefined, actor: AuthUser) {
    const cur = await this.prisma.approval.findUnique({ where: { id }, select: { requestedById: true, entity: true, entityId: true, status: true } });
    if (!cur) throw new NotFoundException('Approval not found');
    assertDifferentPerson(actor.id, cur.requestedById, `you raised this request, so someone else must ${state === 'APPROVED' ? 'approve' : 'reject'} it`);
    if (cur.entity === 'Expense' && cur.entityId) assertDifferentPerson(actor.id, await creatorOf(this.prisma, 'Expense', cur.entityId), 'you logged this expense, so someone else must decide it');
    const row = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.approval.updateMany({ where: { id, status: { in: OPEN } }, data: { status: state, decidedById: actor.id, decidedAt: new Date(), ...(note ? { decisionNote: note } : {}) } });
      if (!claim.count) await this.explainNotOpen(id);
      const a = await tx.approval.findUniqueOrThrow({ where: { id }, include });
      if (a.entity === 'Expense' && a.entityId) await tx.expense.updateMany({ where: { id: a.entityId, status: 'PENDING' }, data: { status: state } });
      if (a.entity === 'VendorPayment' && a.entityId) {
        if (state === 'APPROVED') await tx.vendorPayment.updateMany({ where: { id: a.entityId, status: 'REQUESTED' }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date(), approvalId: a.id } });
        else await tx.vendorPayment.updateMany({ where: { id: a.entityId, status: 'REQUESTED' }, data: { status: 'CANCELLED', approvalId: a.id, failureReason: `Rejected${note ? `: ${note}` : ''}` } });
      }
      await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'Approval', entityId: id, action: state === 'APPROVED' ? 'approve' : 'reject', message: `${state === 'APPROVED' ? 'Approved' : 'Rejected'} ${a.reference ?? ''} ${a.title}${note ? ` — ${note}` : ''}`.replace(/\s+/g, ' '), meta: { type: a.type, amount: a.amount?.toString() ?? null, note: note ?? null, reference: a.reference, requestedById: a.requestedById } }, tx);
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
    if (actor.role !== 'FOUNDER' && a.requestedById !== actor.id) throw new ForbiddenException('Only the requester or a Founder can cancel this request');
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.approval.updateMany({ where: { id, status: { in: OPEN } }, data: { status: 'CANCELLED', decidedById: actor.id, decidedAt: new Date() } });
      if (!c.count) await this.explainNotOpen(id);
      if (a.entity === 'VendorPayment' && a.entityId) await tx.vendorPayment.updateMany({ where: { id: a.entityId, status: 'REQUESTED' }, data: { status: 'CANCELLED', failureReason: 'Approval request cancelled' } });
    });
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'Approval', entityId: id, action: 'cancel', message: `Cancelled request: ${a.title}` });
    return this.prisma.approval.findUniqueOrThrow({ where: { id }, include });
  }

  /** Keeps an open approval in step when the underlying record is decided elsewhere (e.g. Expenses screen). */
  async syncDecision(entity: string, entityId: string, state: 'APPROVED' | 'REJECTED', actorId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const open = await db.approval.findMany({ where: { entity, entityId, status: { in: OPEN } }, select: { id: true } });
    if (!open.length) return;
    // Approvals decided on the source record are still attributed (and the decision is audited by the caller).
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

type PrismaServiceLike = PrismaService;
