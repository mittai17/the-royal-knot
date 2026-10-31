import { Prisma, Role } from '@prisma/client';
import type { AudienceKey } from './announcements.dto';

export const TEAM_ROLES: Role[] = [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS];

export const audienceRoles = (k: AudienceKey): Role[] => (k === 'CLIENTS' ? [Role.CLIENT] : k === 'VENDORS' ? [Role.VENDOR] : k === 'TEAM' ? TEAM_ROLES : []);
export const audienceKey = (roles: Role[]): AudienceKey => (!roles.length ? 'ALL' : roles.length === 1 && roles[0] === Role.CLIENT ? 'CLIENTS' : roles.length === 1 && roles[0] === Role.VENDOR ? 'VENDORS' : 'TEAM');

/** Prisma filter: announcements addressed to `role` that are published and not expired. Wedding / vendor narrowing is added by the caller. */
export function addressedTo(role: Role, now = new Date()): Prisma.AnnouncementWhereInput {
  return { AND: [{ OR: [{ audience: { isEmpty: true } }, { audience: { has: role } }] }, { publishedAt: { lte: now } }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] };
}
