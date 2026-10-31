import { IsId } from '../shared/id';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { PageQuery, Paginated, skipTake } from '../../../common/pagination';
import { G } from '../../../common/permissions';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';

const SAFE = { id: true, email: true, name: true, phone: true, role: true, status: true, available: true, monthlyCost: true, lastLoginAt: true, createdAt: true, mustChangePassword: true, vendorId: true, coupleId: true } satisfies Prisma.UserSelect;

export function tempPassword() {
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789'];
  const all = chars.join('') ;
  let p = chars.map(pick).join('');
  while (p.length < 14) p += pick(all);
  return p.split('').sort(() => randomInt(3) - 1).join('');
}

class AdminCreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() phone?: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() @MinLength(10) password?: string;
  @IsOptional() @IsId() vendorId?: string;
  @IsOptional() @IsId() coupleId?: string;
  @IsOptional() @IsNumber() monthlyCost?: number;
}
class AdminUpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsNumber() monthlyCost?: number;
}
class AdminUserQuery extends PageQuery {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

@ApiTags('admin: users') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Only the Founder may create / modify Founder accounts. */
  private guardAdminRole(actor: AuthUser, ...roles: (Role | undefined)[]) {
    if (actor.role !== Role.ADMIN && roles.includes(Role.ADMIN)) throw new ForbiddenException('Only the Founder can manage Founder / Administrator accounts');
  }

  private async user(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: SAFE });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  @Get() @RequirePermission('users', 'read')
  async list(@Query() q: AdminUserQuery) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([this.prisma.user.findMany({ where, select: SAFE, orderBy: { name: 'asc' }, ...skipTake(q) }), this.prisma.user.count({ where })]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  @Get('summary') @RequirePermission('users', 'read')
  async summary() {
    const g = await this.prisma.user.groupBy({ by: ['role', 'status'], _count: true });
    return { total: g.reduce((a, x) => a + x._count, 0), active: g.filter((x) => x.status === 'ACTIVE').reduce((a, x) => a + x._count, 0), byRole: Object.values(Role).map((role) => ({ role, count: g.filter((x) => x.role === role).reduce((a, x) => a + x._count, 0) })) };
  }

  @Get(':id') @RequirePermission('users', 'read')
  async detail(@Param('id', ParseUUIDPipe) id: string) { return this.user(id); }

  @Get(':id/logins') @RequirePermission('users', 'read')
  async logins(@Param('id', ParseUUIDPipe) id: string) {
    await this.user(id);
    const rows = await this.prisma.activityLog.findMany({ where: { entity: 'User', entityId: id, action: { in: ['login', 'login.failed', 'password.changed', 'logout'] } }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => ({ id: r.id, at: r.createdAt, action: r.action, ok: r.action !== 'login.failed', message: r.message, ip: (r.meta as { ip?: string } | null)?.ip ?? null, via: (r.meta as { via?: string } | null)?.via ?? 'password' }));
  }

  @Post() @RequirePermission('users', 'write')
  async create(@Body() dto: AdminCreateUserDto, @CurrentUser() actor: AuthUser) {
    this.guardAdminRole(actor, dto.role);
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    if (dto.role === Role.VENDOR && !dto.vendorId) throw new BadRequestException('A vendor account must be linked to a vendor record');
    if (dto.role === Role.CLIENT && !dto.coupleId) throw new BadRequestException('A client account must be linked to a couple');
    const password = dto.password ?? tempPassword();
    const u = await this.prisma.user.create({ data: { email, name: dto.name, phone: dto.phone, role: dto.role, monthlyCost: dto.monthlyCost ?? 0, vendorId: dto.role === Role.VENDOR ? dto.vendorId : undefined, coupleId: dto.role === Role.CLIENT ? dto.coupleId : undefined, passwordHash: await argon2.hash(password), mustChangePassword: true }, select: SAFE });
    await this.audit.log({ actorId: actor.id, entity: 'User', entityId: u.id, action: 'create', message: `Created ${u.role} account for ${u.name}`, meta: { role: u.role, via: 'admin' } });
    return { user: u, temporaryPassword: dto.password ? undefined : password };
  }

  @Patch(':id') @RequirePermission('users', 'write')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateUserDto, @CurrentUser() actor: AuthUser) {
    const cur = await this.user(id);
    this.guardAdminRole(actor, cur.role, dto.role);
    if (dto.role && dto.role !== cur.role) {
      if (id === actor.id) throw new BadRequestException('You cannot change your own role');
      if (cur.role === Role.ADMIN) await this.assertOtherAdmin(id);
      if ((dto.role === Role.VENDOR && !cur.vendorId) || (dto.role === Role.CLIENT && !cur.coupleId)) throw new BadRequestException('Vendor / client accounts need a linked vendor or couple; create a new account instead');
    }
    if (dto.email && dto.email.toLowerCase() !== cur.email && (await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } }))) throw new ConflictException('Email already registered');
    const u = await this.prisma.user.update({ where: { id }, data: { ...dto, ...(dto.email ? { email: dto.email.toLowerCase() } : {}) }, select: SAFE });
    if (dto.role && dto.role !== cur.role) await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: actor.id, entity: 'User', entityId: id, action: dto.role && dto.role !== cur.role ? 'role.change' : 'update', message: dto.role && dto.role !== cur.role ? `Changed ${u.name} from ${cur.role} to ${u.role}` : `Updated account ${u.name}`, meta: { fields: Object.keys(dto), ...(dto.role ? { from: cur.role, to: dto.role } : {}) } });
    return u;
  }

  @Post(':id/deactivate') @RequirePermission('users', 'write')
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    const cur = await this.user(id);
    this.guardAdminRole(actor, cur.role);
    if (id === actor.id) throw new BadRequestException('You cannot deactivate your own account');
    if (cur.role === Role.ADMIN) await this.assertOtherAdmin(id);
    const u = await this.prisma.user.update({ where: { id }, data: { status: UserStatus.DISABLED }, select: SAFE });
    const r = await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: actor.id, entity: 'User', entityId: id, action: 'deactivate', message: `Deactivated account ${u.name}`, meta: { sessionsRevoked: r.count } });
    return u;
  }

  @Post(':id/activate') @RequirePermission('users', 'write')
  async activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    const cur = await this.user(id);
    this.guardAdminRole(actor, cur.role);
    const u = await this.prisma.user.update({ where: { id }, data: { status: UserStatus.ACTIVE }, select: SAFE });
    await this.audit.log({ actorId: actor.id, entity: 'User', entityId: id, action: 'activate', message: `Re-activated account ${u.name}` });
    return u;
  }

  /** Sets a one-time temporary password, forces a change at next sign-in and signs the user out everywhere. */
  @Post(':id/reset-password') @RequirePermission('users', 'write')
  async reset(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    const cur = await this.user(id);
    this.guardAdminRole(actor, cur.role);
    const password = tempPassword();
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(password), mustChangePassword: true } });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: actor.id, entity: 'User', entityId: id, action: 'password.reset', message: `Reset password for ${cur.name}` });
    return { temporaryPassword: password, mustChangePassword: true };
  }

  /** Flags the account so the user must choose a new password at next sign-in (password unchanged). */
  @Post(':id/force-password-change') @RequirePermission('users', 'write')
  async force(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    const cur = await this.user(id);
    this.guardAdminRole(actor, cur.role);
    const u = await this.prisma.user.update({ where: { id }, data: { mustChangePassword: true }, select: SAFE });
    await this.audit.log({ actorId: actor.id, entity: 'User', entityId: id, action: 'password.flag', message: `Required ${cur.name} to change password at next sign-in` });
    return u;
  }

  private async assertOtherAdmin(excludeId: string) {
    const n = await this.prisma.user.count({ where: { role: Role.ADMIN, status: UserStatus.ACTIVE, id: { not: excludeId } } });
    if (n < 1) throw new BadRequestException('At least one active Founder / Administrator account must remain');
  }
}
