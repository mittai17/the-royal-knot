import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ThreadChannel, UserStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { ScopeService } from '../../common/scope.service';
import { StorageService } from '../../common/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertOwnAttachments, attachmentMeta, saveAttachment, streamAttachment } from './attachments';
import { STAFF_ROLES, staffCanSee, staffThreadWhere } from './access';
import { CreateThreadDto } from './messaging.dto';

const NOTHING = '00000000-0000-0000-0000-000000000000';
const CHANNEL_LINK: Record<Role, string> = {
  FOUNDER: '/communications', PLANNER: '/communications', EVENT_MANAGER: '/communications', FINANCE: '/communications', OPERATIONS: '/communications',
  CLIENT: '/client-portal/chat', VENDOR: '/vendor-portal/messages', SYSADMIN: '/communications',
};

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private rt: RealtimeService,
    private notif: NotificationsService, private docs: DocumentsService, private storage: StorageService,
  ) {}

  /** Row-level filter for the threads this user may open. */
  async threadWhere(u: AuthUser): Promise<Prisma.MessageThreadWhereInput> {
    if (u.role === Role.CLIENT) {
      const ids = (await this.scope.weddingIds(u)) ?? [];
      return { channel: ThreadChannel.CLIENT, weddingId: { in: ids } };
    }
    if (u.role === Role.VENDOR) return { channel: ThreadChannel.VENDOR, vendorId: u.vendorId ?? NOTHING };
    if (u.role === Role.SYSADMIN) return { id: NOTHING };
    return staffThreadWhere(u);
  }

  /** Loads a thread the user may open: 404 when it does not exist, 403 when it belongs to someone else. */
  async access(u: AuthUser, threadId: string) {
    const t = await this.prisma.messageThread.findUnique({ where: { id: threadId }, include: { wedding: { select: { id: true, name: true, coupleId: true, plannerId: true } } } });
    if (!t) throw new NotFoundException('Conversation not found');
    const ok = await this.prisma.messageThread.count({ where: { id: threadId, ...(await this.threadWhere(u)) } });
    if (!ok) throw new ForbiddenException('You do not have access to this conversation');
    return t;
  }

  private async unreadFor(userId: string, threadIds: string[]) {
    const members = await this.prisma.messageThreadMember.findMany({ where: { userId, threadId: { in: threadIds } } });
    const map = new Map<string, number>();
    await Promise.all(members.map(async (m) => {
      map.set(m.threadId, await this.prisma.message.count({ where: { threadId: m.threadId, senderId: { not: userId }, ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}) } }));
    }));
    return map;
  }

  async listThreads(u: AuthUser, f: { channel?: ThreadChannel; weddingId?: string; search?: string }) {
    if (u.role === Role.CLIENT) await this.ensureClientThreads(u);
    if (u.role === Role.VENDOR) await this.ensureVendorThread(u);
    const where: Prisma.MessageThreadWhereInput = {
      AND: [await this.threadWhere(u), {
        ...(f.channel ? { channel: f.channel } : {}), ...(f.weddingId ? { weddingId: f.weddingId } : {}),
        ...(f.search ? { OR: [{ subject: { contains: f.search, mode: 'insensitive' } }, { wedding: { name: { contains: f.search, mode: 'insensitive' } } }] } : {}),
      }],
    };
    const rows = await this.prisma.messageThread.findMany({
      where, orderBy: { lastMessageAt: 'desc' }, take: 100,
      include: { wedding: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { name: true } } } } },
    });
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: rows.map((r) => r.vendorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const vmap = new Map(vendors.map((v) => [v.id, v.name]));
    const unread = await this.unreadFor(u.id, rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id, channel: r.channel, subject: r.subject, weddingId: r.weddingId, wedding: r.wedding, vendorId: r.vendorId, vendorName: r.vendorId ? vmap.get(r.vendorId) ?? null : null,
      lastMessageAt: r.lastMessageAt, createdAt: r.createdAt, unread: unread.get(r.id) ?? 0,
      lastMessage: r.messages[0] ? { body: r.messages[0].body, senderName: r.messages[0].sender.name, createdAt: r.messages[0].createdAt } : null,
    }));
  }

  async unreadSummary(u: AuthUser) {
    const threads = await this.prisma.messageThread.findMany({ where: await this.threadWhere(u), select: { id: true, channel: true } });
    const unread = await this.unreadFor(u.id, threads.map((t) => t.id));
    const byChannel: Record<string, number> = { CLIENT: 0, VENDOR: 0, TEAM: 0, PLANNER: 0 };
    let total = 0;
    for (const t of threads) { const n = unread.get(t.id) ?? 0; byChannel[t.channel] += n; total += n; }
    return { total, byChannel };
  }

  async getThread(u: AuthUser, id: string) {
    const t = await this.access(u, id);
    const members = await this.prisma.messageThreadMember.findMany({ where: { threadId: id }, include: { user: { select: { id: true, name: true, role: true } } } });
    const vendor = t.vendorId ? await this.prisma.vendor.findUnique({ where: { id: t.vendorId }, select: { id: true, name: true } }) : null;
    return { id: t.id, channel: t.channel, subject: t.subject, weddingId: t.weddingId, wedding: t.wedding && { id: t.wedding.id, name: t.wedding.name }, vendor, createdAt: t.createdAt, participants: members.map((m) => m.user) };
  }

  /** Staff-only: open a conversation. CLIENT / VENDOR channels are for planners and event managers (and the founder). */
  async createThread(u: AuthUser, dto: CreateThreadDto) {
    if ((dto.channel === ThreadChannel.CLIENT || dto.channel === ThreadChannel.VENDOR) && !([Role.PLANNER, Role.EVENT_MANAGER, Role.FOUNDER] as Role[]).includes(u.role)) throw new ForbiddenException('Your role cannot start client or vendor conversations');
    if (dto.channel === ThreadChannel.PLANNER && !([Role.PLANNER, Role.FINANCE, Role.FOUNDER] as Role[]).includes(u.role)) throw new ForbiddenException('Planner/finance conversations are for planners and finance');
    const memberIds = new Set<string>([u.id, ...(dto.memberIds ?? [])]);
    let weddingId: string | null = null;
    let vendorId: string | null = null;
    if (dto.channel === ThreadChannel.CLIENT) {
      if (!dto.weddingId) throw new BadRequestException('weddingId is required for client conversations');
      const w = await this.prisma.wedding.findUnique({ where: { id: dto.weddingId } });
      if (!w) throw new NotFoundException('Wedding not found');
      weddingId = w.id;
      if (w.plannerId) memberIds.add(w.plannerId);
      (await this.prisma.user.findMany({ where: { coupleId: w.coupleId, role: Role.CLIENT, status: UserStatus.ACTIVE }, select: { id: true } })).forEach((x) => memberIds.add(x.id));
    }
    if (dto.channel === ThreadChannel.VENDOR) {
      if (!dto.vendorId) throw new BadRequestException('vendorId is required for vendor conversations');
      if (!(await this.prisma.vendor.count({ where: { id: dto.vendorId } }))) throw new NotFoundException('Vendor not found');
      vendorId = dto.vendorId;
      if (dto.weddingId) { if (!(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found'); weddingId = dto.weddingId; }
      (await this.prisma.user.findMany({ where: { vendorId, role: Role.VENDOR, status: UserStatus.ACTIVE }, select: { id: true } })).forEach((x) => memberIds.add(x.id));
    }
    if (dto.channel === ThreadChannel.TEAM || dto.channel === ThreadChannel.PLANNER) weddingId = dto.weddingId ?? null;
    const valid = await this.prisma.user.findMany({ where: { id: { in: [...memberIds] }, status: UserStatus.ACTIVE }, select: { id: true } });
    const t = await this.prisma.messageThread.create({
      data: { channel: dto.channel, subject: dto.subject.trim(), weddingId, vendorId, createdById: u.id, members: { create: valid.map((x) => ({ userId: x.id, lastReadAt: x.id === u.id ? new Date() : null })) } },
    });
    await this.audit.log({ actorId: u.id, weddingId, entity: 'MessageThread', entityId: t.id, action: 'create', message: `Started ${dto.channel.toLowerCase()} conversation "${t.subject}"` });
    return this.getThread(u, t.id);
  }

  /** CLIENT: one planner chat per wedding of their couple, created on first visit. */
  async ensureClientThreads(u: AuthUser) {
    const ids = await this.scope.requireClientWeddingIds(u);
    if (!ids.length) return;
    const have = await this.prisma.messageThread.findMany({ where: { channel: ThreadChannel.CLIENT, weddingId: { in: ids } }, select: { weddingId: true } });
    const missing = ids.filter((id) => !have.some((h) => h.weddingId === id));
    for (const id of missing) {
      const w = await this.prisma.wedding.findUnique({ where: { id } });
      if (!w) continue;
      const clients = await this.prisma.user.findMany({ where: { coupleId: w.coupleId, role: Role.CLIENT, status: UserStatus.ACTIVE }, select: { id: true } });
      const members = new Set([...clients.map((c) => c.id), ...(w.plannerId ? [w.plannerId] : [])]);
      const t = await this.prisma.messageThread.create({ data: { channel: ThreadChannel.CLIENT, subject: `${w.name} · Planner chat`, weddingId: id, createdById: u.id, members: { create: [...members].map((userId) => ({ userId })) } } });
      await this.audit.log({ actorId: u.id, weddingId: id, entity: 'MessageThread', entityId: t.id, action: 'create', message: 'Planner chat opened' });
    }
  }

  /** VENDOR: a default planner chat for the vendor record, created on first visit. */
  async ensureVendorThread(u: AuthUser) {
    const vendorId = this.scope.requireVendorId(u);
    if (await this.prisma.messageThread.count({ where: { channel: ThreadChannel.VENDOR, vendorId } })) return;
    const v = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } });
    const users = await this.prisma.user.findMany({ where: { vendorId, role: Role.VENDOR, status: UserStatus.ACTIVE }, select: { id: true } });
    const t = await this.prisma.messageThread.create({ data: { channel: ThreadChannel.VENDOR, subject: `${v?.name ?? 'Vendor'} · Planner chat`, vendorId, createdById: u.id, members: { create: users.map((x) => ({ userId: x.id })) } } });
    await this.audit.log({ actorId: u.id, entity: 'MessageThread', entityId: t.id, action: 'create', message: 'Vendor chat opened' });
  }

  async messages(u: AuthUser, threadId: string, q: { before?: string; take?: number }) {
    await this.access(u, threadId);
    const take = Math.min(Math.max(q.take ?? 50, 1), 200);
    const rows = await this.prisma.message.findMany({
      where: { threadId, ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}) },
      orderBy: { createdAt: 'desc' }, take, include: { sender: { select: { id: true, name: true, role: true } } },
    });
    rows.reverse();
    return this.shape(rows);
  }

  private async shape(rows: (Prisma.MessageGetPayload<{ include: { sender: { select: { id: true; name: true; role: true } } } }>)[]) {
    const meta = await attachmentMeta(this.prisma, rows.flatMap((r) => r.attachmentDocumentIds));
    return rows.map((r) => ({
      id: r.id, threadId: r.threadId, senderId: r.senderId, sender: r.sender, body: r.body, createdAt: r.createdAt,
      attachments: r.attachmentDocumentIds.map((id) => meta.get(id)).filter(Boolean),
    }));
  }

  /** Who should receive a live push for a message in this thread (members + every staff user allowed to open it). */
  private async recipients(t: { id: string; channel: ThreadChannel; weddingId: string | null; vendorId: string | null; wedding?: { coupleId: string; plannerId: string | null } | null }) {
    const members = await this.prisma.messageThreadMember.findMany({ where: { threadId: t.id }, select: { userId: true } });
    const ids = new Set(members.map((m) => m.userId));
    const staff = await this.prisma.user.findMany({ where: { status: UserStatus.ACTIVE, role: { in: [Role.FOUNDER, ...STAFF_ROLES] } }, select: { id: true, role: true } });
    for (const s of staff) if (staffCanSee(s, { channel: t.channel, memberIds: [...ids], hasWedding: !!t.weddingId, weddingPlannerId: t.wedding?.plannerId })) ids.add(s.id);
    if (t.channel === ThreadChannel.CLIENT && t.wedding) (await this.prisma.user.findMany({ where: { coupleId: t.wedding.coupleId, role: Role.CLIENT, status: UserStatus.ACTIVE }, select: { id: true } })).forEach((x) => ids.add(x.id));
    if (t.channel === ThreadChannel.VENDOR && t.vendorId) (await this.prisma.user.findMany({ where: { vendorId: t.vendorId, role: Role.VENDOR, status: UserStatus.ACTIVE }, select: { id: true } })).forEach((x) => ids.add(x.id));
    return ids;
  }

  /** Persist first, then broadcast the saved row. */
  async send(u: AuthUser, threadId: string, body: string | undefined, attachmentIds: string[] = []) {
    const t = await this.access(u, threadId);
    const text = (body ?? '').trim();
    if (!text && !attachmentIds.length) throw new BadRequestException('Write a message or attach a file');
    await assertOwnAttachments(this.prisma, u, attachmentIds);
    const saved = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { threadId, senderId: u.id, body: text, attachmentDocumentIds: attachmentIds }, include: { sender: { select: { id: true, name: true, role: true } } } });
      await tx.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: m.createdAt } });
      await tx.messageThreadMember.upsert({ where: { threadId_userId: { threadId, userId: u.id } }, update: { lastReadAt: m.createdAt }, create: { threadId, userId: u.id, lastReadAt: m.createdAt } });
      return m;
    });
    const [msg] = await this.shape([saved]);
    // Notify members who had nothing unread yet (so the bell is not spammed once per message).
    const members = await this.prisma.messageThreadMember.findMany({ where: { threadId, userId: { not: u.id } }, include: { user: { select: { id: true, role: true, status: true } } } });
    const toNotify: Record<string, string[]> = {};
    for (const m of members) {
      if (m.user.status !== UserStatus.ACTIVE) continue;
      const pending = await this.prisma.message.count({ where: { threadId, senderId: { not: m.userId }, id: { not: saved.id }, ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}) } });
      if (pending === 0) (toNotify[CHANNEL_LINK[m.user.role]] ??= []).push(m.userId);
    }
    for (const [link, userIds] of Object.entries(toNotify)) {
      await this.notif.notify({ type: 'message', title: `New message from ${u.name}`, body: (text || 'Sent an attachment').slice(0, 140), link, userIds }).catch(() => undefined);
    }
    for (const id of await this.recipients(t)) this.rt.toUser(id, 'message.new', { threadId, channel: t.channel, weddingId: t.weddingId, message: msg });
    await this.audit.log({ actorId: u.id, weddingId: t.weddingId, entity: 'Message', entityId: saved.id, action: 'send', message: `Message in "${t.subject}"`, meta: { threadId, channel: t.channel, attachments: attachmentIds.length } });
    return msg;
  }

  async markRead(u: AuthUser, threadId: string) {
    await this.access(u, threadId);
    const now = new Date();
    await this.prisma.messageThreadMember.upsert({ where: { threadId_userId: { threadId, userId: u.id } }, update: { lastReadAt: now }, create: { threadId, userId: u.id, lastReadAt: now } });
    return { ok: true };
  }

  async upload(u: AuthUser, threadId: string, file: Express.Multer.File) {
    const t = await this.access(u, threadId);
    return saveAttachment(this.docs, u, t.weddingId, file);
  }

  async download(u: AuthUser, threadId: string, docId: string) {
    await this.access(u, threadId);
    const inThread = await this.prisma.message.count({ where: { threadId, attachmentDocumentIds: { has: docId } } });
    const own = inThread ? 1 : await this.prisma.document.count({ where: { id: docId, uploadedById: u.id } });
    if (!inThread && !own) throw new ForbiddenException('This file does not belong to the conversation');
    return streamAttachment(this.prisma, this.storage, docId);
  }
}
