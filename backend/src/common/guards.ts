import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { decodeProtectedHeader } from 'jose';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { IS_PUBLIC, ROLES_KEY } from './decorators';
import { env } from '../config/env';
import { KeycloakService } from '../modules/auth/keycloak.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector, private keycloak: KeycloakService) { super(); }
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    // Keycloak access tokens are asymmetric (RS256); the app's own tokens are HS256 and go through passport.
    if (this.keycloak.enabled) {
      const req = ctx.switchToHttp().getRequest();
      const m = /^Bearer (.+)$/i.exec(req.headers?.authorization ?? '');
      if (m && !req.cookies?.access_token && this.isAsymmetric(m[1])) {
        req.user = await this.keycloak.authenticate(m[1]);
        return true;
      }
    }
    return (await super.canActivate(ctx)) as boolean;
  }
  private isAsymmetric(token: string) {
    try { return decodeProtectedHeader(token).alg !== 'HS256'; } catch { return false; }
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
