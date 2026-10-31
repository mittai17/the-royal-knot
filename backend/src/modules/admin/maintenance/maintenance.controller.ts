import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import IORedis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { env } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import { HealthService } from '../../../health/health.controller';
import { AuditService } from '../../audit/audit.service';
import { PermissionsService } from '../roles/permissions.service';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { SettingsService } from '../shared/settings.service';

/** Application cache keys live under this prefix. Maintenance only ever deletes `cache:*`; BullMQ keys (`bull:*`) are never touched. */
export const CACHE_PREFIX = 'cache:';

function appVersion() {
  try { return JSON.parse(readFileSync(join(__dirname, '../../../../package.json'), 'utf8')).version as string; } catch { return process.env.npm_package_version ?? 'unknown'; }
}

@ApiTags('admin: maintenance') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/maintenance')
export class MaintenanceController {
  constructor(private prisma: PrismaService, private audit: AuditService, private health: HealthService, private settings: SettingsService, private perms: PermissionsService) {}

  @Get('info') @RequirePermission('maintenance', 'read')
  async info() {
    const [ver, mig, size, last] = await Promise.all([
      this.prisma.$queryRaw<{ version: string }[]>`SELECT version() AS version`.catch(() => []),
      this.prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5`.catch(() => []),
      this.prisma.$queryRaw<{ s: bigint }[]>`SELECT pg_database_size(current_database()) AS s`.catch(() => []),
      this.prisma.activityLog.findMany({ where: { entity: 'Maintenance' }, orderBy: { createdAt: 'desc' }, take: 15, include: { actor: { select: { name: true } } } }),
    ]);
    return {
      app: { name: 'The Royal Knot', version: appVersion(), node: process.version, environment: process.env.NODE_ENV ?? 'development', startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString() },
      database: { version: ver[0]?.version?.split(' on ')[0] ?? null, sizeBytes: Number(size[0]?.s ?? 0), latestMigrations: mig.map((m) => ({ name: m.migration_name, appliedAt: m.finished_at })) },
      update: { channel: 'manual', message: 'Updates are deployed by redeploying the container images (Dokploy). No automatic update source is configured.', currentVersion: appVersion() },
      history: last.map((l) => ({ id: l.id, at: l.createdAt, action: l.action, message: l.message, by: l.actor?.name ?? null })),
    };
  }

  /** Deletes application cache keys only (`cache:*`) and drops in-process caches (settings, permissions). Never flushes BullMQ queues. */
  @Post('clear-cache') @RequirePermission('maintenance', 'write')
  async clearCache(@CurrentUser() u: AuthUser) {
    let redisKeys = 0, redis: 'ok' | 'unavailable' = 'ok';
    const r = new IORedis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 3000 });
    try {
      await r.connect();
      let cursor = '0';
      do {
        const [next, keys] = await r.scan(cursor, 'MATCH', `${CACHE_PREFIX}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length) redisKeys += await r.unlink(...keys);
      } while (cursor !== '0');
    } catch { redis = 'unavailable'; } finally { r.disconnect(); }
    const memory = this.settings.clear();
    this.perms.invalidate();
    await this.audit.log({ actorId: u.id, entity: 'Maintenance', action: 'clear-cache', message: `Cleared cache (${redisKeys} Redis keys, ${memory} in-memory entries)`, meta: { redisKeys, memory, redis } });
    return { redis, redisKeysCleared: redisKeys, memoryEntriesCleared: memory, note: 'Only cache:* keys were removed; job queues were not touched.' };
  }

  @Post('health-check') @RequirePermission('maintenance', 'write')
  async healthCheck(@CurrentUser() u: AuthUser) {
    const r = await this.health.collect();
    await this.audit.log({ actorId: u.id, entity: 'Maintenance', action: 'health-check', message: `Health check: ${r.status}`, meta: { status: r.status } });
    return r;
  }

  @Post('optimize-database') @RequirePermission('maintenance', 'write')
  async vacuum(@CurrentUser() u: AuthUser) {
    const t0 = Date.now();
    await this.prisma.$executeRawUnsafe('VACUUM (ANALYZE)');
    const ms = Date.now() - t0;
    await this.audit.log({ actorId: u.id, entity: 'Maintenance', action: 'vacuum', message: `Database VACUUM ANALYZE finished in ${ms} ms`, meta: { ms } });
    return { ok: true, durationMs: ms, message: 'VACUUM ANALYZE completed' };
  }

  @Post('reindex') @RequirePermission('maintenance', 'write')
  async reindex(@CurrentUser() u: AuthUser) {
    const t0 = Date.now();
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_indexes WHERE schemaname = 'public'`;
    await this.prisma.$executeRawUnsafe('REINDEX SCHEMA public');
    const ms = Date.now() - t0;
    await this.audit.log({ actorId: u.id, entity: 'Maintenance', action: 'reindex', message: `Rebuilt ${n} database indexes in ${ms} ms`, meta: { indexes: Number(n), ms } });
    return { ok: true, indexes: Number(n), durationMs: ms, message: `Rebuilt ${n} indexes (search and lookup)` };
  }
}
