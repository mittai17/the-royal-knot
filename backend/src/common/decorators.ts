import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const ROLES_KEY = 'roles';
export const Roles = (...roles: (Role | Role[])[]) => SetMetadata(ROLES_KEY, roles.flat());
/** Route any signed-in user may call, including the default-deny roles (CLIENT, VENDOR, SYSADMIN). Use sparingly. */
export const ALLOW_EXTERNAL = 'allowExternal';
export const AllowExternal = () => SetMetadata(ALLOW_EXTERNAL, true);

export interface AuthUser {
  id: string; email: string; name: string; role: Role; mustChangePassword: boolean;
  /** VENDOR users: their vendor record. CLIENT users: their couple. */
  vendorId?: string | null; coupleId?: string | null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
