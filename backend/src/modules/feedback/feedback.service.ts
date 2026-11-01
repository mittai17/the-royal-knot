import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackKind, FeedbackStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { Paginated, skipTake } from '../../common/pagination';
import { ScopeService } from '../../common/scope.service';
import { StorageService } from '../../common/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertOwnAttachments, attachmentMeta, saveAttachment, streamAttachment } from '../messaging/attachments';
import { decodeSubject, encodeSubject } from './category';
import { FeedbackQuery, SubmitFeedbackDto, UpdateFeedbackDto } from './feedback.dto';

const include = { wedding: { select: { id: true, name: true } } } satisfies Prisma.FeedbackRequestInclude;
type Row = Prisma.FeedbackRequestGetPayload<{ include: typeof include }>;
const USER_LINK: Record<Role, string> = { FOUNDER: '/feedback', PLANNER: '/feedback', EVENT_MANAGER: '/feedback', FINANCE: '/feedback', OPERATIONS: '/feedback', CLIENT: '/client-portal/feedback', VENDOR: '/vendor-portal/support', SYSADMIN: '/feedback' };

@Injectable()
export class FeedbackService {
  constructor(
    private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private notif: NotificationsService,
    private rt: RealtimeService, private docs: DocumentsService, private storage: StorageService,
  ) {}

  /** Row filter: who may see which request. */
  private async where(u: AuthUser): Promise<Prisma.FeedbackRequestWhereInput> {
    if (u.role === Role.CLIENT) {
      if (!u.coupleId) throw new ForbiddenException('This account is not linked to a couple');
      const mates = (await this.prisma.user.findMany({ where: { coupleId: u.coupleId }, select: { id: true } })).map((x) => x.id);
      return { kind: { not: FeedbackKind.SUPPORT }, submittedById: { in: mates } };
    }
    if (u.role === Role.VENDOR) {
      const vendorId = this.scope.requireVendorId(u);
      const mates = (await this.prisma.user.findMany({ where: { vendorId }, select: { id: true } })).map((x) => x.id);
      return { kind: FeedbackKind.SUPPORT, submittedById: { in: mates } };
    }
    if (u.role === Role.PLANNER) return { OR: [{ weddingId: null }, { wedding: { plannerId: u.id } }, { assignedToId: u.id }, { submittedById: u.id }] };
    if (u.role === Role.FOUNDER || u.role === Role.EVENT_MANAGER) return {};
    throw new ForbiddenException('Your role does not allow this action');
  }

  private async shape(rows: Row[]) {
    const userIds = [...new Set(rows.flatMap((r) => [r.submittedById, r.assignedToId]).filter((x): x is string => !!x))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } });
    const um = new Map(users.map((x) => [x.id, x]));
    const meta = await attachmentMeta(this.prisma, rows.flatMap((r) => r.attachmentDocumentIds));
    return rows.map((r) => {
      const d = decodeSubject(r.subject);
      return {
        id: r.id, kind: r.kind, status: r.status, category: d.category, subject: d.subject, body: r.body, rating: r.rating, response: r.response, weddingId: r.weddingId, wedding: r.wedding,
        submittedBy: r.submittedById ? um.get(r.submittedById) ?? null : null, assignedTo: r.assignedToId ? um.get(r.assignedToId) ?? null : null,
        attachments: r.attachmentDocumentIds.map((id) => meta.get(id)).filter(Boolean), resolvedAt: r.resolvedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
      };
    });
  }

  async list(u: AuthUser, q: FeedbackQuery) {
    const extra: Prisma.FeedbackRequestWhereInput = {
      ...(q.status ? { status: q.status } : {}), ...(q.kind && u.role !== Role.VENDOR ? { kind: q.kind } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}),
      ...(q.search ? { OR: [{ subject: { contains: q.search, mode: 'insensitive' } }, { body: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const where: Prisma.FeedbackRequestWhereInput = { AND: [await this.where(u), extra] };
    const [rows, total] = await Promise.all([this.prisma.feedbackRequest.findMany({ where, orderBy: { createdAt: 'desc' }, include, ...skipTake(q) }), this.prisma.feedbackRequest.count({ where })]);
    return new Paginated(await this.shape(rows), { page: q.page, pageSize: q.pageSize, total });
  }

  async summary(u: AuthUser) {
    const where = await this.where(u);
    const g = await this.prisma.feedbackRequest.groupBy({ by: ['status'], where, _count: true });
    const out = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, total: 0 };
    for (const r of g) { out[r.status] = r._count; out.total += r._count; }
    return out;
  }

  private async load(u: AuthUser, id: string) {
    const exists = await this.prisma.feedbackRequest.findUnique({ where: { id }, include });
    if (!exists) throw new NotFoundException('Request not found');
    const ok = await this.prisma.feedbackRequest.count({ where: { AND: [{ id }, await this.where(u)] } });
    if (!ok) throw new ForbiddenException('You do not have access to this request');
    return exists;
  }

  async get(u: AuthUser, id: string) { return (await this.shape([await this.load(u, id)]))[0]; }

  async submit(u: AuthUser, dto: SubmitFeedbackDto) {
    let weddingId: string | null = dto.weddingId ?? null;
    let kind: FeedbackKind;
    if (u.role === Role.CLIENT) {
      const ids = await this.scope.requireClientWeddingIds(u);
      if (weddingId && !ids.includes(weddingId)) throw new ForbiddenException('You do not have access to this wedding');
      weddingId ??= ids[0] ?? null;
      kind = dto.kind === FeedbackKind.FEEDBACK ? FeedbackKind.FEEDBACK : FeedbackKind.REQUEST;
    } else if (u.role === Role.VENDOR) {
      this.scope.requireVendorId(u);
      if (weddingId) await this.scope.assertWeddingAccess(u, weddingId);
      kind = FeedbackKind.SUPPORT;
    } else throw new ForbiddenException('Only clients and vendors submit requests');
    if (dto.rating && kind !== FeedbackKind.FEEDBACK) throw new BadRequestException('Ratings are only for feedback');
    await assertOwnAttachments(this.prisma, u, dto.attachmentDocumentIds ?? []);
    const row = await this.prisma.feedbackRequest.create({
      data: { kind, weddingId, submittedById: u.id, subject: encodeSubject(dto.category, dto.subject), body: dto.body.trim(), rating: dto.rating ?? null, attachmentDocumentIds: dto.attachmentDocumentIds ?? [] },
      include,
    });
    const w = weddingId ? await this.prisma.wedding.findUnique({ where: { id: weddingId }, select: { plannerId: true } }) : null;
    await this.notif.notify({
      type: 'feedback', title: `${kind === 'SUPPORT' ? 'Support ticket' : kind === 'FEEDBACK' ? 'Feedback' : 'New request'} from ${u.name}`, body: dto.subject.slice(0, 140), link: '/feedback',
      ...(w?.plannerId ? { userIds: [w.plannerId] } : { roles: [Role.PLANNER] }),
    }).catch(() => undefined);
    await this.audit.log({ actorId: u.id, weddingId, entity: 'FeedbackRequest', entityId: row.id, action: 'submit', message: `${kind.toLowerCase()} submitted: ${dto.subject}` });
    return (await this.shape([row]))[0];
  }

  /** Staff reply / status change. */
  async update(u: AuthUser, id: string, dto: UpdateFeedbackDto) {
    const cur = await this.load(u, id);
    let status = dto.status;
    if (!status && dto.response && cur.status === FeedbackStatus.OPEN) status = FeedbackStatus.IN_PROGRESS;
    const done = status === FeedbackStatus.RESOLVED || status === FeedbackStatus.CLOSED;
    const row = await this.prisma.feedbackRequest.update({
      where: { id },
      data: { ...(status ? { status } : {}), ...(dto.response !== undefined ? { response: dto.response.trim() || null } : {}), assignedToId: dto.assignedToId ?? cur.assignedToId ?? u.id, ...(status ? { resolvedAt: done ? new Date() : null } : {}) },
      include,
    });
    if (row.submittedById && (dto.response || (status && status !== cur.status))) {
      const sub = await this.prisma.user.findUnique({ where: { id: row.submittedById }, select: { id: true, role: true } });
      if (sub) {
        await this.notif.notify({ type: 'feedback', title: dto.response ? 'Your planner replied to your request' : `Your request is now ${status!.toLowerCase().replace('_', ' ')}`, body: decodeSubject(row.subject).subject, link: USER_LINK[sub.role], userIds: [sub.id] }).catch(() => undefined);
        this.rt.toUser(sub.id, 'feedback.updated', { id });
      }
    }
    await this.audit.log({ actorId: u.id, weddingId: row.weddingId, entity: 'FeedbackRequest', entityId: id, action: 'update', message: `${dto.response ? 'Replied; ' : ''}status ${cur.status} -> ${row.status}` });
    return (await this.shape([row]))[0];
  }

  async upload(u: AuthUser, file: Express.Multer.File) { return saveAttachment(this.docs, u, null, file); }

  async download(u: AuthUser, id: string, docId: string) {
    const r = await this.load(u, id);
    if (!r.attachmentDocumentIds.includes(docId)) throw new ForbiddenException('This file does not belong to the request');
    return streamAttachment(this.prisma, this.storage, docId);
  }
}
