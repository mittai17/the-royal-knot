import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString, ValidateNested } from 'class-validator';
import { AllowExternal, AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { ACTIONS, G, MODULES, PERMISSION_MATRIX, expandMatrix } from '../../../common/permissions';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { PermissionsService } from './permissions.service';

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  ADMIN: { label: 'Founder / Administrator', description: 'Full oversight: approvals, profitability, team and settings. Always allowed everywhere.' },
  PLANNER: { label: 'Wedding Planner', description: 'Clients, proposals, planning, vendors and guests.' },
  EVENT_MANAGER: { label: 'Event Manager', description: 'Live operations, run sheet, vendor check-in and incidents.' },
  FINANCE: { label: 'Finance Manager', description: 'Invoices, vendor bills, payments, reconciliation and budgets.' },
  OPERATIONS: { label: 'Operations Staff', description: 'Assigned tasks, checklists, guests, accommodation and transport.' },
  CLIENT: { label: 'Couple / Client', description: 'Portal scoped to their own wedding.' },
  VENDOR: { label: 'Vendor', description: 'Portal scoped to their own vendor record.' },
  SYSADMIN: { label: 'System Administrator', description: 'Users, roles, configuration and infrastructure. No financial or wedding data access.' },
};

/** Modules the SYSADMIN role may be granted (infra + identity only; never money or wedding data). */
const SYSADMIN_MODULES = new Set(['users', 'roles', 'org', 'master-data', 'config', 'integrations', 'email', 'storage', 'monitoring', 'audit', 'backups', 'maintenance', 'notifications', 'team', 'analytics']);
/** SYSADMIN may never lose these (lock-out protection). */
const SYSADMIN_LOCKED = new Set(['users:read', 'users:write', 'roles:read', 'roles:write']);

class ChangeDto {
  @IsString() @IsIn([...MODULES]) module: string;
  @IsString() @IsIn([...ACTIONS]) action: string;
  @IsBoolean() allowed: boolean;
}
class UpdatePermissionsDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ChangeDto) changes: ChangeDto[];
}

@ApiTags('admin: roles') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/roles')
export class RolesController {
  constructor(private prisma: PrismaService, private perms: PermissionsService, private audit: AuditService) {}

  @Get() @RequirePermission('roles', 'read')
  async list() {
    const [groups, matrix] = await Promise.all([this.prisma.user.groupBy({ by: ['role', 'status'], _count: true }), this.perms.matrix()]);
    return Object.values(Role).map((role) => {
      const total = groups.filter((g) => g.role === role).reduce((a, g) => a + g._count, 0);
      const active = groups.find((g) => g.role === role && g.status === 'ACTIVE')?._count ?? 0;
      const grants = Object.values(matrix[role]).reduce((a, c) => a + (c.read ? 1 : 0) + (c.write ? 1 : 0) + (c.approve ? 1 : 0), 0);
      return { role, ...ROLE_INFO[role], userCount: total, activeUserCount: active, grantCount: grants, editable: role !== Role.ADMIN };
    });
  }

  @Get('matrix') @RequirePermission('roles', 'read')
  async matrix() { return { modules: MODULES, actions: ACTIONS, matrix: await this.perms.matrix(), locked: { ADMIN: 'all', SYSADMIN: [...SYSADMIN_LOCKED] } }; }

  @Put(':role/permissions') @RequirePermission('roles', 'write')
  async update(@Param('role') roleParam: string, @Body() dto: UpdatePermissionsDto, @CurrentUser() u: AuthUser) {
    const role = this.parseRole(roleParam);
    if (role === Role.ADMIN) throw new BadRequestException('The Founder / Administrator role always has full access and cannot be edited');
    const before = await this.perms.matrix();
    const applied: { module: string; action: string; allowed: boolean }[] = [];
    for (const c of dto.changes) {
      if (role === Role.SYSADMIN) {
        if (!SYSADMIN_MODULES.has(c.module) && c.allowed) throw new BadRequestException(`System Administrator cannot be granted ${c.module}: financial and wedding data stay off-limits`);
        if (SYSADMIN_LOCKED.has(`${c.module}:${c.action}`) && !c.allowed) throw new BadRequestException(`System Administrator must keep ${c.module}:${c.action} (lock-out protection)`);
      }
      // write implies read: revoking read also revokes write/approve; granting write/approve grants read.
      const cell = before[role][c.module];
      if (!c.allowed && c.action === 'read' && (cell.write || cell.approve)) { applied.push({ module: c.module, action: 'write', allowed: false }, { module: c.module, action: 'approve', allowed: false }); }
      if (c.allowed && c.action !== 'read') applied.push({ module: c.module, action: 'read', allowed: true });
      applied.push(c);
    }
    await this.prisma.$transaction(applied.map((c) => this.prisma.rolePermission.upsert({ where: { role_module_action: { role, module: c.module, action: c.action } }, create: { role, module: c.module, action: c.action, allowed: c.allowed }, update: { allowed: c.allowed } })));
    this.perms.invalidate();
    const after = await this.perms.matrix();
    const diff = dto.changes.filter((c) => (after[role][c.module]?.[c.action as 'read'] ?? false) !== (before[role][c.module]?.[c.action as 'read'] ?? false));
    await this.audit.log({ actorId: u.id, entity: 'RolePermission', entityId: role, action: 'update', message: `Changed ${diff.length} permission(s) for ${ROLE_INFO[role].label}`, meta: { role, changes: diff.map((c) => `${c.module}:${c.action}=${c.allowed}`) } });
    return { role, changed: diff.length, permissions: after[role] };
  }

  @Post(':role/reset') @RequirePermission('roles', 'write')
  async reset(@Param('role') roleParam: string, @CurrentUser() u: AuthUser) {
    const role = this.parseRole(roleParam);
    if (role === Role.ADMIN) throw new BadRequestException('The Founder / Administrator role cannot be edited');
    const rows = expandMatrix().filter((r) => r.role === role);
    await this.prisma.$transaction([this.prisma.rolePermission.deleteMany({ where: { role } }), this.prisma.rolePermission.createMany({ data: rows })]);
    this.perms.invalidate();
    await this.audit.log({ actorId: u.id, entity: 'RolePermission', entityId: role, action: 'reset', message: `Reset ${ROLE_INFO[role].label} permissions to defaults`, meta: { grants: PERMISSION_MATRIX[role].length } });
    return { role, permissions: (await this.perms.matrix())[role] };
  }

  private parseRole(r: string): Role {
    const role = r.toUpperCase() as Role;
    if (!(role in Role)) throw new BadRequestException('Unknown role');
    return role;
  }
}

/** Effective (DB-backed) permissions of the signed-in user, so the UI can follow edits made in Roles & Permissions. */
@ApiTags('config') @ApiCookieAuth() @Controller('config')
export class MyPermissionsController {
  constructor(private perms: PermissionsService) {}
  @Get('my-permissions') @AllowExternal()
  async mine(@CurrentUser() u: AuthUser) {
    if (!u) throw new ForbiddenException();
    return { role: u.role, permissions: await this.perms.forRole(u.role) };
  }
}
