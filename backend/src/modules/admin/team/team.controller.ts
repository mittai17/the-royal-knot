import { IsId } from '../shared/id';
import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role, TaskStatus, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SettingsService, pickStrings } from '../shared/settings.service';
import { ORG_BUSINESS_DEFAULTS, ORG_PROFILE_DEFAULTS } from '../org/org.controller';
import { randomUUID } from 'crypto';
import { UsersService } from '../../users/users.service';

const INTERNAL: Role[] = [Role.FOUNDER, Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS];
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
  constructor(private prisma: PrismaService, private audit: AuditService, private users: UsersService) {}

  /** Founder: company-wide. Planner: only their assigned team (themself, owners of tasks on their weddings, their team mates); no cost data. */
  @Get('overview') @Roles(Role.PLANNER)
  async overview(@CurrentUser() viewer: AuthUser) {
    const ids = await this.users.assignedTeamIds(viewer);
    const founder = viewer.role === Role.FOUNDER;
    const members = await this.prisma.user.findMany({
      where: { role: { in: INTERNAL }, ...(ids ? { id: { in: ids } } : {}) }, orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, available: true, lastLoginAt: true, monthlyCost: true, teamMembers: { select: { team: { select: { id: true, name: true } } } } },
    });
    const now = new Date();
    const [weddings, tasks, overdue] = await Promise.all([
      this.prisma.wedding.findMany({ where: { plannerId: { not: null }, status: ACTIVE_WEDDING }, select: { id: true, name: true, status: true, startDate: true, plannerId: true }, orderBy: { startDate: 'asc' } }),
      this.prisma.weddingTask.groupBy({ by: ['ownerId', 'status'], where: { ownerId: { not: null } }, _count: true }),
      this.prisma.weddingTask.groupBy({ by: ['ownerId'], where: { ownerId: { not: null }, status: { not: TaskStatus.DONE }, dueDate: { lt: now } }, _count: true }),
    ]);
    return members.map(({ teamMembers, monthlyCost, ...m0 }) => {
      const m = founder ? { ...m0, monthlyCost } : m0;
      const t = tasks.filter((x) => x.ownerId === m.id);
      const done = t.filter((x) => x.status === TaskStatus.DONE).reduce((a, x) => a + x._count, 0);
      const total = t.reduce((a, x) => a + x._count, 0);
      const open = total - done;
      const myWeddings = weddings.filter((w) => w.plannerId === m.id);
      const ov = overdue.find((o) => o.ownerId === m.id)?._count ?? 0;
      return { ...m, teams: teamMembers.map((x) => x.team), activeWeddings: myWeddings, activeWeddingCount: myWeddings.length, openTasks: open, completedTasks: done, overdueTasks: ov, taskCompletionPct: total ? Math.round((done / total) * 100) : null, workload: myWeddings.length * 3 + open + ov * 2 };
    });
  }

  @Post('reassign') @Roles(Role.FOUNDER)
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
        tasks = (await tx.weddingTask.updateMany({ where: { ownerId: dto.fromUserId, status: { not: TaskStatus.DONE }, ...(scope === 'selected' ? { weddingId: { in: owned.map((w) => w.id) } } : {}) }, data: { ownerId: dto.toUserId } })).count;
      }
      await this.audit.log({ actorId: u.id, entity: 'Team', entityId: dto.fromUserId, action: 'reassign', message: `Reassigned ${weddings} wedding(s) and ${tasks} open task(s) from ${from.name} to ${to.name}`, meta: { from: from.id, to: to.id, weddings, tasks, scope } }, tx);
      return { weddings, tasks };
    });
    return { from: from.name, to: to.name, ...result };
  }
}

const DEFAULT_LIMITS = { vendorPayment: 100000, extraExpense: 50000, clientDiscount: 25000, vendorContract: 500000 };
/** Demo configuration only: milestone shares are configured per contract; this is just the template new contracts start from. */
export const DEFAULT_MILESTONES = [
  { type: 'BOOKING', label: 'Booking', percent: 20, dueRule: 'On confirmation' },
  { type: 'ADVANCE', label: 'Advance', percent: 40, dueRule: '30 days before the wedding' },
  { type: 'FINAL', label: 'Final settlement', percent: 40, dueRule: '7 days after the wedding' },
];

export const DEFAULT_NOTIFICATION_POLICIES = [
  { key: 'payment.due', label: 'Client payment due / overdue', enabled: true, inApp: true, email: true, reminderDays: 3 },
  { key: 'approval.pending', label: 'Approval waiting for the Founder', enabled: true, inApp: true, email: true, reminderDays: 1 },
  { key: 'task.overdue', label: 'Task overdue', enabled: true, inApp: true, email: false, reminderDays: 0 },
  { key: 'vendor.quotation', label: 'Vendor quotation received', enabled: true, inApp: true, email: false, reminderDays: null },
  { key: 'event.incident', label: 'Incident reported on event day', enabled: true, inApp: true, email: true, reminderDays: null },
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

/** Founder Business Settings (Module 32), SystemSetting-backed: company profile, pricing defaults, payment milestone template, approval thresholds, locations, wedding templates, notification policies.
 * Packages, service catalogue and vendor categories are MasterDataItem lists (PACKAGE, SERVICE_CATEGORY, VENDOR_CATEGORY) and task templates live under /task-templates.
 * Founder FOUNDER only: the System Administrator has no say over financial policy. */
@ApiTags('settings') @ApiCookieAuth() @Controller('settings') @Roles(Role.FOUNDER)
export class FounderSettingsController {
  constructor(private settings: SettingsService) {}

  @Get('company-profile') companyProfile() { return this.settings.getMerged('org.profile', ORG_PROFILE_DEFAULTS); }
  @Put('company-profile')
  async saveCompanyProfile(@Body() body: Record<string, unknown>, @CurrentUser() u: AuthUser) {
    const p = pickStrings(body, Object.keys(ORG_PROFILE_DEFAULTS));
    if ('name' in p && p.name.length < 2) throw new BadRequestException('Company name is required');
    if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) throw new BadRequestException('Company email is not valid');
    if (p.website && !/^https?:\/\//i.test(p.website)) throw new BadRequestException('Website must start with http:// or https://');
    const merged = { ...(await this.settings.getMerged('org.profile', ORG_PROFILE_DEFAULTS)), ...p };
    await this.settings.set('org.profile', merged, u.id, { entity: 'Settings', message: 'Updated company profile', meta: { fields: Object.keys(p) } });
    return merged;
  }

  @Get('pricing-defaults') pricing() { return this.settings.getMerged('org.business', ORG_BUSINESS_DEFAULTS); }
  @Put('pricing-defaults')
  async savePricing(@Body() b: Record<string, unknown>, @CurrentUser() u: AuthUser) {
    const num = (k: string, min: number, max: number) => { const v = b[k]; if (v === undefined) return {}; const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`${k} must be between ${min} and ${max}`); return { [k]: n }; };
    const merged = { ...(await this.settings.getMerged('org.business', ORG_BUSINESS_DEFAULTS)), ...pickStrings(b, ['invoicePrefix', 'workingDays', 'workingHours', 'supportEmail'], 60), ...num('gstRatePercent', 0, 100), ...num('paymentTermsDays', 0, 365), ...num('quotationValidityDays', 0, 365) };
    await this.settings.set('org.business', merged, u.id, { entity: 'Settings', message: 'Updated pricing defaults', meta: { fields: Object.keys(b) } });
    return merged;
  }

  @Get('business-locations') locations() { return this.settings.get<unknown[]>('org.locations', []); }
  @Put('business-locations')
  async saveLocations(@Body() body: { locations?: unknown[] }, @CurrentUser() u: AuthUser) {
    if (!Array.isArray(body.locations) || body.locations.length > 50) throw new BadRequestException('locations must be a list of at most 50 entries');
    const locs = body.locations.map((l) => { const x = pickStrings(l, ['id', 'name', 'type', 'address', 'city', 'phone']); if (!x.name) throw new BadRequestException('Every location needs a name'); return { id: x.id || randomUUID(), name: x.name, type: x.type || 'Office', address: x.address ?? '', city: x.city ?? '', phone: x.phone ?? '' }; });
    await this.settings.set('org.locations', locs, u.id, { entity: 'Settings', message: `Updated business locations (${locs.length})` });
    return locs;
  }

  @Get('wedding-templates') weddingTemplates() { return this.settings.get<unknown[]>('business.wedding-templates', []); }
  @Put('wedding-templates')
  async saveWeddingTemplates(@Body() body: { templates?: unknown[] }, @CurrentUser() u: AuthUser) {
    if (!Array.isArray(body.templates) || body.templates.length > 50) throw new BadRequestException('templates must be a list of at most 50 entries');
    const list = body.templates.map((t) => {
      const x = pickStrings(t, ['id', 'name', 'packageType', 'description'], 500);
      if (!x.name) throw new BadRequestException('Every wedding template needs a name');
      const fns = Array.isArray((t as { functions?: unknown }).functions) ? ((t as { functions: unknown[] }).functions.filter((f) => typeof f === 'string') as string[]).map((f) => f.trim().slice(0, 80)).filter(Boolean).slice(0, 30) : [];
      return { id: x.id || randomUUID(), name: x.name, packageType: x.packageType || 'FULL_SERVICE', description: x.description ?? '', functions: fns };
    });
    await this.settings.set('business.wedding-templates', list, u.id, { entity: 'Settings', message: `Updated wedding templates (${list.length})` });
    return list;
  }

  @Get('notification-policies') notificationPolicies() { return this.settings.get('business.notification-policies', DEFAULT_NOTIFICATION_POLICIES); }
  @Put('notification-policies')
  async saveNotificationPolicies(@Body() body: { policies?: unknown[] }, @CurrentUser() u: AuthUser) {
    if (!Array.isArray(body.policies) || body.policies.length > 60) throw new BadRequestException('policies must be a list of at most 60 entries');
    const list = body.policies.map((p) => {
      const x = pickStrings(p, ['key', 'label']);
      if (!x.key) throw new BadRequestException('Every policy needs a key');
      const q = p as { enabled?: unknown; inApp?: unknown; email?: unknown; reminderDays?: unknown };
      const days = q.reminderDays === undefined || q.reminderDays === null ? null : Number(q.reminderDays);
      if (days !== null && (!Number.isFinite(days) || days < 0 || days > 365)) throw new BadRequestException('reminderDays must be between 0 and 365');
      return { key: x.key, label: x.label || x.key, enabled: q.enabled !== false, inApp: q.inApp !== false, email: q.email === true, reminderDays: days };
    });
    await this.settings.set('business.notification-policies', list, u.id, { entity: 'Settings', message: 'Updated notification policies' });
    return list;
  }

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
