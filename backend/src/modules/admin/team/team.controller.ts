import { IsId } from '../shared/id';
import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role, TaskStatus, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SettingsService } from '../shared/settings.service';

const INTERNAL: Role[] = [Role.ADMIN, Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS];
const ACTIVE_WEDDING = { notIn: ['COMPLETED', 'CANCELLED'] as ('COMPLETED' | 'CANCELLED')[] };

class ReassignDto {
  @IsId() fromUserId: string;
  @IsId() toUserId: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsId(true) weddingIds?: string[];
  /** none: wedding ownership only. selected: also the open tasks of the chosen weddings. all: every open task of the source user. */
  @IsOptional() @IsIn(['none', 'selected', 'all']) taskScope?: 'none' | 'selected' | 'all';
}

/** Founder: Team Management (members, active weddings, workload, task completion, reassign). Planner may view. */
@ApiTags('team') @ApiCookieAuth() @Controller('team')
export class TeamController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('overview') @Roles(Role.PLANNER)
  async overview() {
    const members = await this.prisma.user.findMany({
      where: { role: { in: INTERNAL } }, orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, available: true, lastLoginAt: true, monthlyCost: true, teamMembers: { select: { team: { select: { id: true, name: true } } } } },
    });
    const now = new Date();
    const [weddings, tasks, overdue] = await Promise.all([
      this.prisma.wedding.findMany({ where: { plannerId: { not: null }, status: ACTIVE_WEDDING }, select: { id: true, name: true, status: true, startDate: true, plannerId: true }, orderBy: { startDate: 'asc' } }),
      this.prisma.weddingTask.groupBy({ by: ['ownerId', 'status'], where: { ownerId: { not: null } }, _count: true }),
      this.prisma.weddingTask.groupBy({ by: ['ownerId'], where: { ownerId: { not: null }, status: { not: TaskStatus.COMPLETED }, dueDate: { lt: now } }, _count: true }),
    ]);
    return members.map(({ teamMembers, ...m }) => {
      const t = tasks.filter((x) => x.ownerId === m.id);
      const done = t.filter((x) => x.status === TaskStatus.COMPLETED).reduce((a, x) => a + x._count, 0);
      const total = t.reduce((a, x) => a + x._count, 0);
      const open = total - done;
      const myWeddings = weddings.filter((w) => w.plannerId === m.id);
      const ov = overdue.find((o) => o.ownerId === m.id)?._count ?? 0;
      return { ...m, teams: teamMembers.map((x) => x.team), activeWeddings: myWeddings, activeWeddingCount: myWeddings.length, openTasks: open, completedTasks: done, overdueTasks: ov, taskCompletionPct: total ? Math.round((done / total) * 100) : null, workload: myWeddings.length * 3 + open + ov * 2 };
    });
  }

  @Post('reassign') @Roles(Role.ADMIN)
  async reassign(@Body() dto: ReassignDto, @CurrentUser() u: AuthUser) {
    if (dto.fromUserId === dto.toUserId) throw new BadRequestException('Choose two different people');
    const [from, to] = await Promise.all([this.prisma.user.findUnique({ where: { id: dto.fromUserId } }), this.prisma.user.findUnique({ where: { id: dto.toUserId } })]);
    if (!from || !to) throw new NotFoundException('User not found');
    if (to.status !== UserStatus.ACTIVE || !INTERNAL.includes(to.role)) throw new BadRequestException('Work can only be reassigned to an active team member');
    const scope = dto.taskScope ?? 'none';
    if (!dto.weddingIds?.length && scope !== 'all') throw new BadRequestException('Select weddings or choose to move all open tasks');
    const result = await this.prisma.$transaction(async (tx) => {
      let weddings = 0, tasks = 0;
      const owned = dto.weddingIds?.length ? await tx.wedding.findMany({ where: { id: { in: dto.weddingIds }, plannerId: dto.fromUserId }, select: { id: true, name: true } }) : [];
      if (dto.weddingIds?.length && owned.length !== new Set(dto.weddingIds).size) throw new BadRequestException('Some weddings are not assigned to the source person');
      if (owned.length) {
        weddings = (await tx.wedding.updateMany({ where: { id: { in: owned.map((w) => w.id) } }, data: { plannerId: dto.toUserId } })).count;
        for (const w of owned) await this.audit.log({ actorId: u.id, weddingId: w.id, entity: 'Wedding', entityId: w.id, action: 'reassign', message: `${w.name} reassigned from ${from.name} to ${to.name}` }, tx);
      }
      if (scope !== 'none') {
        tasks = (await tx.weddingTask.updateMany({ where: { ownerId: dto.fromUserId, status: { not: TaskStatus.COMPLETED }, ...(scope === 'selected' ? { weddingId: { in: owned.map((w) => w.id) } } : {}) }, data: { ownerId: dto.toUserId } })).count;
      }
      await this.audit.log({ actorId: u.id, entity: 'Team', entityId: dto.fromUserId, action: 'reassign', message: `Reassigned ${weddings} wedding(s) and ${tasks} open task(s) from ${from.name} to ${to.name}`, meta: { from: from.id, to: to.id, weddings, tasks, scope } }, tx);
      return { weddings, tasks };
    });
    return { from: from.name, to: to.name, ...result };
  }
}

const DEFAULT_LIMITS = { vendorPayment: 100000, extraExpense: 50000, clientDiscount: 25000, vendorContract: 500000 };
export const DEFAULT_MILESTONES = [
  { type: 'BOOKING', label: 'Booking', percent: 20, dueRule: 'On confirmation' },
  { type: 'ADVANCE', label: 'Advance', percent: 40, dueRule: '30 days before the wedding' },
  { type: 'FINAL', label: 'Final settlement', percent: 40, dueRule: '7 days after the wedding' },
];

class LimitsDto {
  @IsNumber() @Min(0) @Max(1e9) vendorPayment: number;
  @IsNumber() @Min(0) @Max(1e9) extraExpense: number;
  @IsNumber() @Min(0) @Max(1e9) clientDiscount: number;
  @IsNumber() @Min(0) @Max(1e9) vendorContract: number;
}
class MilestoneDto {
  @IsString() @IsIn(['BOOKING', 'ADVANCE', 'FINAL']) type: string;
  @IsString() label: string;
  @IsNumber() @Min(0) @Max(100) percent: number;
  @IsOptional() @IsString() dueRule?: string;
}
class MilestonesDto { @IsArray() @ValidateNested({ each: true }) @Type(() => MilestoneDto) milestones: MilestoneDto[]; }

/** Founder business rules (SystemSetting-backed). ADMIN only: the System Administrator has no say over financial policy. */
@ApiTags('settings') @ApiCookieAuth() @Controller('settings') @Roles(Role.ADMIN)
export class FounderSettingsController {
  constructor(private settings: SettingsService) {}

  @Get('approval-limits') limits() { return this.settings.getMerged('approval.limits', DEFAULT_LIMITS); }
  @Put('approval-limits')
  async saveLimits(@Body() dto: LimitsDto, @CurrentUser() u: AuthUser) {
    await this.settings.set('approval.limits', dto, u.id, { entity: 'Settings', message: 'Updated approval limits', meta: { ...dto } });
    return dto;
  }

  @Get('payment-milestones') milestones() { return this.settings.get('payment.milestones', DEFAULT_MILESTONES); }
  @Put('payment-milestones')
  async saveMilestones(@Body() dto: MilestonesDto, @CurrentUser() u: AuthUser) {
    const types = dto.milestones.map((m) => m.type);
    if (new Set(types).size !== types.length) throw new BadRequestException('Each milestone type may appear once');
    if (Math.round(dto.milestones.reduce((a, m) => a + m.percent, 0) * 100) !== 10000) throw new BadRequestException('Milestone percentages must add up to 100');
    await this.settings.set('payment.milestones', dto.milestones, u.id, { entity: 'Settings', message: 'Updated payment milestone template', meta: { split: dto.milestones.map((m) => `${m.type}:${m.percent}`) } });
    return dto.milestones;
  }
}
