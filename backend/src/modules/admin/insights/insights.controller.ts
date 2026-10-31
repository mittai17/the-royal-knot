import { IsId } from '../shared/id';
import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { Roles } from '../../../common/decorators';
import { PageQuery, Paginated, skipTake } from '../../../common/pagination';
import { G } from '../../../common/permissions';
import { env } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import { HealthService } from '../../../health/health.controller';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { logBuffer } from '../shared/ring-logger';
import { AdminStorageService } from '../storage/storage.controller';

const DAY = 864e5;
const days = (n: number) => Math.min(Math.max(Math.trunc(n) || 30, 1), 365);
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

async function dailySeries(prisma: PrismaService, n: number, filter: Prisma.Sql) {
  const from = new Date(startOfDay(new Date()).getTime() - (n - 1) * DAY);
  const rows = await prisma.$queryRaw<{ d: Date; events: bigint; logins: bigint; failed: bigint; users: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS d, count(*) AS events,
      count(*) FILTER (WHERE action = 'login') AS logins, count(*) FILTER (WHERE action = 'login.failed') AS failed,
      count(DISTINCT "actorId") AS users
    FROM "ActivityLog" WHERE "createdAt" >= ${from} AND ${filter} GROUP BY 1 ORDER BY 1`;
  return Array.from({ length: n }, (_, i) => {
    const day = new Date(from.getTime() + i * DAY);
    const r = rows.find((x) => x.d.getTime() === day.getTime());
    return { date: day.toISOString().slice(0, 10), events: Number(r?.events ?? 0), logins: Number(r?.logins ?? 0), failedLogins: Number(r?.failed ?? 0), activeUsers: Number(r?.users ?? 0) };
  });
}

export class AuditQuery extends PageQuery {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsId() actorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['security']) category?: string;
}

@ApiTags('admin: insights') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin')
export class InsightsController {
  constructor(private prisma: PrismaService, private health: HealthService, private storage: AdminStorageService,
    @InjectQueue('reminders') private reminders: Queue, @InjectQueue('documents') private documents: Queue, @InjectQueue('email') private email: Queue) {}

  @Get('dashboard') @RequirePermission('monitoring', 'read')
  async dashboard() {
    const since24 = new Date(Date.now() - DAY);
    const [byRole, weddings, docs, series, health, failed24, recent, bucket] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role', 'status'], _count: true }),
      this.prisma.wedding.groupBy({ by: ['status'], _count: true }),
      this.prisma.document.aggregate({ _sum: { size: true }, _count: true }),
      dailySeries(this.prisma, 30, Prisma.sql`true`),
      this.health.collect(),
      this.prisma.activityLog.count({ where: { action: 'login.failed', createdAt: { gte: since24 } } }),
      this.prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { name: true } } } }),
      this.storage.bucketStats(env.minio.bucket).catch(() => null),
    ]);
    const active = byRole.filter((r) => r.status === UserStatus.ACTIVE);
    return {
      users: { total: byRole.reduce((a, r) => a + r._count, 0), active: active.reduce((a, r) => a + r._count, 0) },
      roles: { total: Object.values(Role).length, active: new Set(active.map((r) => r.role)).size },
      weddings: { active: weddings.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status)).reduce((a, w) => a + w._count, 0), total: weddings.reduce((a, w) => a + w._count, 0) },
      storage: { documentBytes: docs._sum.size ?? 0, documents: docs._count, bucketBytes: bucket?.bytes ?? null, bucketObjects: bucket?.objects ?? null },
      activity: series, security: { failedLogins24h: failed24 }, health,
      recent: recent.map((r) => ({ id: r.id, at: r.createdAt, action: r.action, entity: r.entity, message: r.message, actor: r.actor?.name ?? null })),
    };
  }

  @Get('reports') @RequirePermission('analytics', 'read')
  async reports(@Query('days') d?: string) {
    const n = days(Number(d));
    const from = new Date(Date.now() - n * DAY);
    const [perUser, perEntity, logins, failed, series, docsByCat, byRoleUsers, bucket] = await Promise.all([
      this.prisma.activityLog.groupBy({ by: ['actorId'], where: { createdAt: { gte: from }, actorId: { not: null } }, _count: true, _max: { createdAt: true }, orderBy: { _count: { actorId: 'desc' } }, take: 15 }),
      this.prisma.activityLog.groupBy({ by: ['entity'], where: { createdAt: { gte: from } }, _count: true, orderBy: { _count: { entity: 'desc' } }, take: 20 }),
      this.prisma.activityLog.groupBy({ by: ['actorId'], where: { createdAt: { gte: from }, action: 'login' }, _count: true }),
      this.prisma.activityLog.count({ where: { createdAt: { gte: from }, action: 'login.failed' } }),
      dailySeries(this.prisma, Math.min(n, 90), Prisma.sql`true`),
      this.prisma.document.groupBy({ by: ['category'], _count: true, _sum: { size: true } }),
      this.prisma.user.groupBy({ by: ['role'], where: { status: UserStatus.ACTIVE }, _count: true }),
      this.storage.bucketStats(env.minio.bucket).catch(() => null),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: perUser.map((p) => p.actorId!).filter(Boolean) } }, select: { id: true, name: true, role: true } });
    const logs = logBuffer.all().filter((l) => new Date(l.time) >= from);
    const failedJobs = await Promise.all([this.reminders, this.documents, this.email].map((q) => q.getFailedCount().catch(() => 0)));
    return {
      days: n, totals: { events: perEntity.reduce((a, e) => a + e._count, 0), logins: logins.reduce((a, l) => a + l._count, 0), failedLogins: failed, activeUsers: perUser.length },
      userActivity: perUser.map((p) => ({ userId: p.actorId, name: users.find((u) => u.id === p.actorId)?.name ?? 'Unknown', role: users.find((u) => u.id === p.actorId)?.role ?? null, actions: p._count, logins: logins.find((l) => l.actorId === p.actorId)?._count ?? 0, lastActive: p._max.createdAt })),
      moduleUsage: perEntity.map((e) => ({ module: e.entity, events: e._count })),
      daily: series,
      errors: { errorsSinceStart: logBuffer.all().filter((l) => l.level === 'error').length, errorsInRange: logs.filter((l) => l.level === 'error').length, warningsInRange: logs.filter((l) => l.level === 'warn').length, failedLogins: failed, failedJobs: failedJobs.reduce((a, b) => a + b, 0), note: 'Application errors are counted from the in-memory log buffer (since the API last started).' },
      storage: { bucketBytes: bucket?.bytes ?? null, bucketObjects: bucket?.objects ?? null, documentsByCategory: docsByCat.map((c) => ({ category: c.category, count: c._count, bytes: c._sum.size ?? 0 })), usersByRole: byRoleUsers.map((r) => ({ role: r.role, count: r._count })) },
    };
  }

  @Get('support-logs') @RequirePermission('monitoring', 'read')
  async supportLogs(@Query('level') level?: string, @Query('search') search?: string, @Query('limit') limit?: string) {
    const lim = Math.min(Math.max(parseInt(limit ?? '200', 10) || 200, 1), 1000);
    const all = logBuffer.all();
    const q = search?.toLowerCase();
    const logs = all.filter((l) => (!level || l.level === level) && (!q || l.message.toLowerCase().includes(q) || l.context.toLowerCase().includes(q))).slice(-lim).reverse();
    const counts = all.reduce<Record<string, number>>((a, l) => { a[l.level] = (a[l.level] ?? 0) + 1; return a; }, {});
    const failedJobs: { queue: string; id: string | undefined; name: string; reason: string | undefined; attempts: number; at: string | null }[] = [];
    for (const q2 of [this.reminders, this.documents, this.email]) {
      for (const j of await q2.getFailed(0, 19).catch(() => [])) failedJobs.push({ queue: q2.name, id: j.id, name: j.name, reason: j.failedReason, attempts: j.attemptsMade, at: j.finishedOn ? new Date(j.finishedOn).toISOString() : null });
    }
    failedJobs.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
    return { logs, counts, bufferSize: all.length, bufferMax: 2000, failedJobs };
  }

  private auditWhere(q: AuditQuery): Prisma.ActivityLogWhereInput {
    return {
      ...(q.entity ? { entity: q.entity } : {}), ...(q.action ? { action: q.action } : {}), ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.category === 'security' ? { action: { in: ['login', 'login.failed', 'password.changed', 'password.reset', 'password.flag', 'role.change', 'deactivate', 'activate'] } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(new Date(q.to).getTime() + (q.to.length <= 10 ? DAY - 1 : 0)) } : {}) } } : {}),
      ...(q.search ? { OR: [{ message: { contains: q.search, mode: 'insensitive' } }, { entity: { contains: q.search, mode: 'insensitive' } }, { action: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
  }

  @Get('audit') @RequirePermission('audit', 'read')
  async audit(@Query() q: AuditQuery) {
    const where = this.auditWhere(q);
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, name: true, role: true } } }, ...skipTake(q) }),
      this.prisma.activityLog.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  @Get('audit/summary') @RequirePermission('audit', 'read')
  async auditSummary() {
    const since = new Date(Date.now() - DAY);
    const [logins, failed, users, entities, actions, recentFailed] = await Promise.all([
      this.prisma.activityLog.count({ where: { action: 'login', createdAt: { gte: since } } }),
      this.prisma.activityLog.count({ where: { action: 'login.failed', createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: since } } }),
      this.prisma.activityLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
      this.prisma.activityLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
      this.prisma.activityLog.findMany({ where: { action: 'login.failed' }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    return { logins24h: logins, failedLogins24h: failed, usersActive24h: users, entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action), recentFailedLogins: recentFailed.map((r) => ({ id: r.id, at: r.createdAt, message: r.message, ip: (r.meta as { ip?: string } | null)?.ip ?? null })) };
  }

  @Get('audit/export') @RequirePermission('audit', 'read')
  async auditExport(@Query() q: AuditQuery) {
    const rows = await this.prisma.activityLog.findMany({ where: this.auditWhere(q), orderBy: { createdAt: 'desc' }, take: 5000, include: { actor: { select: { name: true, role: true } } } });
    const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const csv = ['time,actor,role,entity,action,message,ip', ...rows.map((r) => [r.createdAt.toISOString(), r.actor?.name, r.actor?.role, r.entity, r.action, r.message, (r.meta as { ip?: string } | null)?.ip].map(cell).join(','))].join('\n');
    return new StreamableFile(Buffer.from(csv), { type: 'text/csv', disposition: `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"` });
  }
}

