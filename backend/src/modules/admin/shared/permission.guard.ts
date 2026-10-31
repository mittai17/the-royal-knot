import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../roles/permissions.service';

export const REQUIRE_PERMISSION = 'requirePermission';
/** DB-backed permission check (RolePermission table, code matrix as fallback). Use together with `@UseGuards(PermissionGuard)`; runs after the global role guards. ADMIN always passes. */
export const RequirePermission = (module: string, action: 'read' | 'write' | 'approve') => SetMetadata(REQUIRE_PERMISSION, { module, action });

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector, private perms: PermissionsService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = this.reflector.getAllAndOverride<{ module: string; action: 'read' | 'write' | 'approve' } | undefined>(REQUIRE_PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    if (!req) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Sign in required');
    if (await this.perms.can(user.role, req.module, req.action)) return true;
    throw new ForbiddenException(`Your role does not have ${req.module}:${req.action} permission`);
  }
}
