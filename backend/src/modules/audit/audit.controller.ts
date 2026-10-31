import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators';
import { PageQuery, Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('audit') @ApiCookieAuth() @Controller('audit') @Roles(Role.ADMIN)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query() q: PageQuery, @Query('entity') entity?: string, @Query('weddingId') weddingId?: string) {
    const where = { ...(entity ? { entity } : {}), ...(weddingId ? { weddingId } : {}), ...(q.search ? { message: { contains: q.search, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, name: true, role: true } } }, ...skipTake(q) }),
      this.prisma.activityLog.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }
}
