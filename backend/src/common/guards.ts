import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { IS_PUBLIC, ROLES_KEY } from './decorators';
import { env } from '../config/env';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }
  canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    return super.canActivate(ctx);
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) return true; // public route
    if (user.role === Role.ADMIN || roles.includes(user.role)) return true;
    throw new ForbiddenException('Your role does not allow this action');
  }
}

/** CSRF mitigation for cookie auth: SameSite=Lax cookies + Origin check on state-changing requests. */
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.headers.origin as string | undefined;
    if (!origin) return true; // non-browser clients (curl, server-to-server, tests)
    const allowed = env.frontendUrl.split(',').map((s) => s.trim());
    if (allowed.includes(origin)) return true;
    throw new ForbiddenException('Cross-origin request blocked');
  }
}
