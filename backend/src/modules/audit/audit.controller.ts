import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { Roles } from '../../common/decorators';
import { PageQuery, Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { toCsv } from '../budgets/csv';

export class AuditQuery extends PageQuery {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['json', 'csv']) @Type(() => String) format?: 'json' | 'csv';
}

@ApiTags('audit') @ApiCookieAuth() @Controller('audit') @Roles(Role.ADMIN, Role.SYSADMIN, Role.FINANCE)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  private where(q: AuditQuery): Prisma.ActivityLogWhereInput {
    const to = q.to ? new Date(q.to) : undefined;
    if (to && !q.to!.includes('T')) to.setUTCHours(23, 59, 59, 999);
    return {
      ...(q.entity ? { entity: q.entity } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.actorId ? { actorId: q.actorId } : {}), ...(q.action ? { action: q.action } : {}),
      ...(q.from || to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q.search ? { OR: [{ message: { contains: q.search, mode: 'insensitive' as const } }, { entity: { contains: q.search, mode: 'insensitive' as const } }, { actor: { name: { contains: q.search, mode: 'insensitive' as const } } }] } : {}),
    };
  }

  @Get()
  async list(@Query() q: AuditQuery) {
    const where = this.where(q);
    const include = { actor: { select: { id: true, name: true, role: true } }, wedding: { select: { id: true, name: true } } };
    if (q.format === 'csv') {
      const rows = await this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10000, include });
      const csv = toCsv(rows.map((r) => ({ timestamp: r.createdAt, user: r.actor?.name ?? 'System', role: r.actor?.role ?? '', action: r.action, record: r.entity, recordId: r.entityId ?? '', wedding: r.wedding?.name ?? '', details: r.message ?? '' })), ['timestamp', 'user', 'role', 'action', 'record', 'recordId', 'wedding', 'details']);
      return new StreamableFile(Buffer.from(csv, 'utf8'), { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"` });
    }
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, include, ...skipTake(q) }),
      this.prisma.activityLog.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  /** Filter choices: distinct record types and actions, plus the users who appear in the log. */
  @Get('filters')
  async filters() {
    const [entities, actions, actors] = await Promise.all([
      this.prisma.activityLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
      this.prisma.activityLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
      this.prisma.user.findMany({ where: { activity: { some: {} } }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
    ]);
    return { entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action), actors };
  }
}
