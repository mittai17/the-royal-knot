import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { decodeProtectedHeader } from 'jose';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ALLOW_EXTERNAL, IS_PUBLIC, ROLES_KEY } from './decorators';
import { LOCKED_ROLES } from './permissions';
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
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) return true; // public route
    if (user.role === Role.FOUNDER) return true;
    if (!roles || roles.length === 0) {
      // Default-deny for CLIENT / VENDOR / SYSADMIN: routes that do not name them (or opt in via @AllowExternal) stay staff-only.
      if (LOCKED_ROLES.includes(user.role) && !this.reflector.getAllAndOverride<boolean>(ALLOW_EXTERNAL, [ctx.getHandler(), ctx.getClass()])) {
        throw new ForbiddenException('Your role does not allow this action');
      }
      return true;
    }
    if (roles.includes(user.role)) return true;
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
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    // When forwarded by Next.js rewrites:
    const fwdHost = req.headers['x-forwarded-host'] as string | undefined;
    const fwdProto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    if (fwdHost && allowed.includes(`${fwdProto}://${fwdHost}`)) return true;
    if (fwdHost && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(`${fwdProto}://${fwdHost}`)) return true;
    console.error(`[OriginGuard] Rejected origin: "${origin}", fwdHost: "${fwdHost}", allowed:`, allowed);
    throw new ForbiddenException('Cross-origin request blocked');
  }
}
