import { Injectable } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';

export interface NotifyInput { type: string; title: string; body?: string; link?: string; roles?: Role[]; userIds?: string[]; dedupeKey?: string }

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private rt: RealtimeService) {}

  /** Targets explicit users and/or every active user holding one of `roles` (FOUNDER always included). Dedupe key makes scheduled jobs idempotent. */
  async notify(n: NotifyInput) {
    const targets = new Set(n.userIds ?? []);
    const roleUsers = await this.prisma.user.findMany({ where: { status: UserStatus.ACTIVE, role: { in: [Role.FOUNDER, ...(n.roles ?? [])] } }, select: { id: true } });
    if (n.roles) roleUsers.forEach((u) => targets.add(u.id));
    else if (!n.userIds?.length) roleUsers.forEach((u) => targets.add(u.id));
    let created = 0;
    for (const userId of targets) {
      if (n.dedupeKey) {
        const exists = await this.prisma.notification.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: n.dedupeKey } } });
        if (exists) continue;
      }
      const row = await this.prisma.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey } }).catch(() => null);
      if (row) { created++; this.rt.toUser(userId, 'notification', row); }
    }
    return created;
  }

  list(userId: string, unreadOnly = false, take = 50) {
    return this.prisma.notification.findMany({ where: { userId, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: 'desc' }, take });
  }
  unreadCount(userId: string) { return this.prisma.notification.count({ where: { userId, readAt: null } }); }
  markRead(userId: string, id: string) { return this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } }); }
  markAllRead(userId: string) { return this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } }); }
}
