import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, TaskStatus, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/decorators';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const SAFE = { id: true, email: true, name: true, phone: true, role: true, status: true, available: true, monthlyCost: true, lastLoginAt: true, createdAt: true, mustChangePassword: true, vendorId: true, coupleId: true } satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /**
   * Team scoping (Team Management): FOUNDER / SYSADMIN see everyone (company-wide). A PLANNER sees only the people on their own team:
   * themself, the owners of tasks on weddings they plan, and members of the teams they belong to. Other staff see only themselves in
   * the people-management views. Returns null when unrestricted.
   */
  async assignedTeamIds(u: AuthUser): Promise<string[] | null> {
    if (u.role === Role.FOUNDER || u.role === Role.SYSADMIN) return null;
    if (u.role !== Role.PLANNER) return [u.id];
    const [owners, mine] = await Promise.all([
      this.prisma.weddingTask.findMany({ where: { ownerId: { not: null }, wedding: { plannerId: u.id } }, select: { ownerId: true }, distinct: ['ownerId'] }),
      this.prisma.teamMember.findMany({ where: { userId: u.id }, select: { teamId: true } }),
    ]);
    const mates = mine.length ? await this.prisma.teamMember.findMany({ where: { teamId: { in: mine.map((t) => t.teamId) } }, select: { userId: true } }) : [];
    return [...new Set([u.id, ...owners.map((o) => o.ownerId!), ...mates.map((m) => m.userId)])];
  }

  /** Cost data is Founder-only (SYSADMIN never needs it either). */
  private redact<T extends { monthlyCost?: unknown }>(u: AuthUser, rows: T[]): T[] {
    return u.role === Role.FOUNDER ? rows : rows.map((r) => { const { monthlyCost, ...rest } = r; void monthlyCost; return rest as T; });
  }

  async list(role?: Role, viewer?: AuthUser) {
    const ids = viewer ? await this.assignedTeamIds(viewer) : null;
    const rows = await this.prisma.user.findMany({ where: { ...(role ? { role } : {}), ...(ids ? { id: { in: ids } } : {}) }, select: SAFE, orderBy: { name: 'asc' } });
    return viewer ? this.redact(viewer, rows) : rows;
  }

  async create(dto: CreateUserDto, actorId: string) {
    if (await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } })) throw new ConflictException('Email already registered');
    const u = await this.prisma.user.create({ data: { email: dto.email.toLowerCase(), name: dto.name, phone: dto.phone, role: dto.role, monthlyCost: dto.monthlyCost ?? 0, vendorId: dto.role === Role.VENDOR ? dto.vendorId : undefined, coupleId: dto.role === Role.CLIENT ? dto.coupleId : undefined, passwordHash: await argon2.hash(dto.password), mustChangePassword: true }, select: SAFE });
    await this.audit.log({ actorId, entity: 'User', entityId: u.id, action: 'create', message: `Created ${u.role} account for ${u.name}` });
    return u;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const { password, email, ...rest } = dto;
    const u = await this.prisma.user.update({ where: { id }, data: { ...rest, ...(email ? { email: email.toLowerCase() } : {}), ...(password ? { passwordHash: await argon2.hash(password), mustChangePassword: true } : {}) }, select: SAFE }).catch(() => { throw new NotFoundException('User not found'); });
    if (dto.status === UserStatus.DISABLED) await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId, entity: 'User', entityId: id, action: 'update', message: `Updated account ${u.name}`, meta: { fields: Object.keys(dto).filter((k) => k !== 'password') } });
    return u;
  }

  /** Team workload: assigned weddings, completed/open/overdue tasks. */
  async workload(viewer?: AuthUser) {
    const ids = viewer ? await this.assignedTeamIds(viewer) : null;
    const users = this.redact(viewer ?? ({ role: Role.FOUNDER } as AuthUser), await this.prisma.user.findMany({ where: { status: UserStatus.ACTIVE, role: { notIn: [Role.CLIENT, Role.VENDOR, Role.SYSADMIN] }, ...(ids ? { id: { in: ids } } : {}) }, select: SAFE, orderBy: { name: 'asc' } }));
    const now = new Date();
    const [weddings, tasks] = await Promise.all([
      this.prisma.wedding.groupBy({ by: ['plannerId'], where: { status: { not: 'CANCELLED' } }, _count: true }),
      this.prisma.weddingTask.groupBy({ by: ['ownerId', 'status'], _count: true }),
    ]);
    const overdue = await this.prisma.weddingTask.groupBy({ by: ['ownerId'], where: { status: { not: TaskStatus.DONE }, dueDate: { lt: now } }, _count: true });
    return users.map((u) => {
      const t = tasks.filter((x) => x.ownerId === u.id);
      const completed = t.filter((x) => x.status === 'DONE').reduce((a, x) => a + x._count, 0);
      const open = t.filter((x) => x.status !== 'DONE').reduce((a, x) => a + x._count, 0);
      return { ...u, assignedWeddings: weddings.find((w) => w.plannerId === u.id)?._count ?? 0, completedTasks: completed, openTasks: open, overdueTasks: overdue.find((o) => o.ownerId === u.id)?._count ?? 0 };
    });
  }

  async detail(id: string, viewer?: AuthUser) {
    if (viewer) { const ids = await this.assignedTeamIds(viewer); if (ids && !ids.includes(id)) throw new NotFoundException('User not found'); }
    const u0 = await this.prisma.user.findUnique({ where: { id }, select: SAFE });
    if (!u0) throw new NotFoundException('User not found');
    const u = viewer ? this.redact(viewer, [u0])[0] : u0;
    const [weddings, tasks, activity] = await Promise.all([
      this.prisma.wedding.findMany({ where: { plannerId: id }, select: { id: true, name: true, status: true, startDate: true }, orderBy: { startDate: 'asc' } }),
      this.prisma.weddingTask.findMany({ where: { ownerId: id, status: { not: 'DONE' } }, orderBy: { dueDate: 'asc' }, take: 20, select: { id: true, name: true, dueDate: true, status: true, priority: true, weddingId: true } }),
      this.prisma.activityLog.findMany({ where: { actorId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { ...u, weddings, tasks, activity };
  }

  teams() { return this.prisma.team.findMany({ include: { members: { include: { user: { select: { id: true, name: true, role: true } } } } }, orderBy: { name: 'asc' } }); }
  createTeam(name: string) { return this.prisma.team.create({ data: { name } }); }
  addMember(teamId: string, userId: string) { return this.prisma.teamMember.upsert({ where: { teamId_userId: { teamId, userId } }, update: {}, create: { teamId, userId } }); }
  removeMember(teamId: string, userId: string) { return this.prisma.teamMember.deleteMany({ where: { teamId, userId } }); }
}
