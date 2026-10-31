import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { PageQuery, Paginated, skipTake } from '../../common/pagination';
import { ScopeService } from '../../common/scope.service';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnnouncementQuery, CreateAnnouncementDto, UpdateAnnouncementDto } from './announcements.dto';
import { addressedTo, audienceKey, audienceRoles, TEAM_ROLES } from './audience';

const key = (id: string) => `ann:${id}`;
const LINK: Record<string, string> = { staff: '/announcements', client: '/client-portal/announcements', vendor: '/vendor-portal/announcements' };

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private audit: AuditService, private notif: NotificationsService, private rt: RealtimeService) {}

  private async visibleWhere(u: AuthUser): Promise<Prisma.AnnouncementWhereInput> {
    const base = addressedTo(u.role);
    if (u.role === Role.CLIENT) {
      const ids = (await this.scope.weddingIds(u)) ?? [];
      return { AND: [base, { vendorId: null }, { OR: [{ weddingId: null }, { weddingId: { in: ids } }] }] };
    }
    if (u.role === Role.VENDOR) {
      const ids = (await this.scope.weddingIds(u)) ?? [];
      return { AND: [base, { OR: [{ vendorId: null }, { vendorId: u.vendorId ?? 'none' }] }, { OR: [{ weddingId: null }, { weddingId: { in: ids } }] }] };
    }
    return base;
  }

  private shape(a: Prisma.AnnouncementGetPayload<{ include: { wedding: { select: { id: true; name: true } } } }>, extra: Record<string, unknown> = {}) {
    return { id: a.id, title: a.title, body: a.body, pinned: a.pinned, audience: audienceKey(a.audience), weddingId: a.weddingId, wedding: a.wedding, vendorId: a.vendorId, publishedAt: a.publishedAt, expiresAt: a.expiresAt, authorId: a.authorId, ...extra };
  }

  /** Management list (planner / event manager / founder). Includes how many recipients have read each item. */
  async manage(q: AnnouncementQuery) {
    const where: Prisma.AnnouncementWhereInput = {
      ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { body: { contains: q.search, mode: 'insensitive' } }] } : {}),
      ...(q.audience === 'ALL' ? { audience: { isEmpty: true } } : q.audience ? { audience: { hasSome: audienceRoles(q.audience) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({ where, orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], include: { wedding: { select: { id: true, name: true } } }, ...skipTake(q) }),
      this.prisma.announcement.count({ where }),
    ]);
    const nrows = await this.prisma.notification.findMany({ where: { dedupeKey: { in: rows.map((r) => key(r.id)) } }, select: { dedupeKey: true, readAt: true } });
    const authors = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const items = rows.map((r) => {
      const mine = nrows.filter((n) => n.dedupeKey === key(r.id));
      return this.shape(r, { recipients: mine.length, readCount: mine.filter((n) => n.readAt).length, authorName: authors.find((a) => a.id === r.authorId)?.name ?? null, expired: !!r.expiresAt && r.expiresAt < new Date() });
    });
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  /** The caller's own feed (any role) with per-user read state; pinned first. */
  async feed(u: AuthUser, q: PageQuery) {
    const where = await this.visibleWhere(u);
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({ where, orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], include: { wedding: { select: { id: true, name: true } } }, ...skipTake(q) }),
      this.prisma.announcement.count({ where }),
    ]);
    const nrows = await this.prisma.notification.findMany({ where: { userId: u.id, dedupeKey: { in: rows.map((r) => key(r.id)) } }, select: { dedupeKey: true, readAt: true } });
    const unreadKeys = new Set(nrows.filter((n) => !n.readAt).map((n) => n.dedupeKey));
    const authors = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    return new Paginated(rows.map((r) => this.shape(r, { unread: unreadKeys.has(key(r.id)), authorName: authors.find((a) => a.id === r.authorId)?.name ?? null })), { page: q.page, pageSize: q.pageSize, total });
  }

  async unreadCount(u: AuthUser) {
    const visible = await this.prisma.announcement.findMany({ where: await this.visibleWhere(u), select: { id: true } });
    return { count: await this.prisma.notification.count({ where: { userId: u.id, readAt: null, dedupeKey: { in: visible.map((v) => key(v.id)) } } }) };
  }

  async markRead(u: AuthUser, id: string) {
    const a = await this.prisma.announcement.findFirst({ where: { id, AND: [await this.visibleWhere(u)] }, select: { id: true } });
    if (!a) throw new NotFoundException('Announcement not found');
    await this.prisma.notification.updateMany({ where: { userId: u.id, dedupeKey: key(id), readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(u: AuthUser) {
    const visible = await this.prisma.announcement.findMany({ where: await this.visibleWhere(u), select: { id: true } });
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null, dedupeKey: { in: visible.map((v) => key(v.id)) } }, data: { readAt: new Date() } });
    return { ok: true };
  }

  private async targets(a: { id: string; audience: Role[]; weddingId: string | null; vendorId: string | null }) {
    const roles = a.audience.length ? a.audience : [Role.CLIENT, Role.VENDOR, ...TEAM_ROLES];
    const wedding = a.weddingId ? await this.prisma.wedding.findUnique({ where: { id: a.weddingId }, select: { coupleId: true, weddingVendors: { select: { vendorId: true } }, requests: { select: { vendorId: true } } } }) : null;
    const out: Record<'staff' | 'client' | 'vendor', string[]> = { staff: [], client: [], vendor: [] };
    const active = { status: UserStatus.ACTIVE };
    if (roles.includes(Role.CLIENT) && !a.vendorId) {
      out.client = (await this.prisma.user.findMany({ where: { ...active, role: Role.CLIENT, ...(wedding ? { coupleId: wedding.coupleId } : {}) }, select: { id: true } })).map((x) => x.id);
    }
    if (roles.includes(Role.VENDOR)) {
      const vids = a.vendorId ? [a.vendorId] : wedding ? [...new Set([...wedding.weddingVendors, ...wedding.requests].map((x) => x.vendorId))] : null;
      out.vendor = (await this.prisma.user.findMany({ where: { ...active, role: Role.VENDOR, ...(vids ? { vendorId: { in: vids } } : {}) }, select: { id: true } })).map((x) => x.id);
    }
    const staffRoles = roles.filter((r) => TEAM_ROLES.includes(r));
    if (staffRoles.length && !a.vendorId) out.staff = (await this.prisma.user.findMany({ where: { ...active, role: { in: staffRoles } }, select: { id: true } })).map((x) => x.id);
    return out;
  }

  async create(u: AuthUser, dto: CreateAnnouncementDto) {
    if (dto.weddingId && !(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    if (dto.vendorId && !(await this.prisma.vendor.count({ where: { id: dto.vendorId } }))) throw new NotFoundException('Vendor not found');
    const a = await this.prisma.announcement.create({
      data: { title: dto.title.trim(), body: dto.body.trim(), audience: audienceRoles(dto.audience), weddingId: dto.weddingId ?? null, vendorId: dto.vendorId ?? null, pinned: dto.pinned ?? false, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, authorId: u.id },
      include: { wedding: { select: { id: true, name: true } } },
    });
    const t = await this.targets(a);
    for (const g of ['staff', 'client', 'vendor'] as const) {
      const userIds = t[g].filter((id) => id !== u.id);
      if (userIds.length) await this.notif.notify({ type: 'announcement', title: a.title, body: a.body.slice(0, 140), link: LINK[g], userIds, dedupeKey: key(a.id) });
    }
    [...t.staff, ...t.client, ...t.vendor].forEach((id) => this.rt.toUser(id, 'announcement.new', { id: a.id, title: a.title }));
    await this.audit.log({ actorId: u.id, weddingId: a.weddingId, entity: 'Announcement', entityId: a.id, action: 'publish', message: `Published "${a.title}" to ${dto.audience.toLowerCase()}`, meta: { recipients: t.staff.length + t.client.length + t.vendor.length } });
    return this.shape(a, { recipients: t.staff.length + t.client.length + t.vendor.length, readCount: 0 });
  }

  async update(u: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    const cur = await this.prisma.announcement.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Announcement not found');
    const a = await this.prisma.announcement.update({
      where: { id }, data: { ...(dto.title ? { title: dto.title.trim() } : {}), ...(dto.body ? { body: dto.body.trim() } : {}), ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}), ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}) },
      include: { wedding: { select: { id: true, name: true } } },
    });
    await this.audit.log({ actorId: u.id, weddingId: a.weddingId, entity: 'Announcement', entityId: id, action: 'update', message: `Updated "${a.title}"` });
    return this.shape(a);
  }

  async remove(u: AuthUser, id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Announcement not found');
    if (a.authorId && a.authorId !== u.id && u.role !== Role.ADMIN) throw new ForbiddenException('Only the author or a founder can delete an announcement');
    await this.prisma.$transaction([this.prisma.notification.deleteMany({ where: { dedupeKey: key(id) } }), this.prisma.announcement.delete({ where: { id } })]);
    await this.audit.log({ actorId: u.id, weddingId: a.weddingId, entity: 'Announcement', entityId: id, action: 'delete', message: `Deleted "${a.title}"` });
    return { ok: true };
  }
}
