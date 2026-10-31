import { Prisma, Role, ThreadChannel } from '@prisma/client';

export const STAFF_ROLES: Role[] = [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS];

/**
 * Which threads a staff user may open (SQL form). ADMIN: all. Everyone: threads they are a member of + team chat.
 * PLANNER: client/vendor threads of own (or unassigned) weddings + planner<->finance. FINANCE: planner<->finance.
 * EVENT_MANAGER / OPERATIONS: vendor threads.
 */
export function staffThreadWhere(u: { id: string; role: Role }): Prisma.MessageThreadWhereInput {
  if (u.role === Role.ADMIN) return {};
  const or: Prisma.MessageThreadWhereInput[] = [{ members: { some: { userId: u.id } } }, { channel: ThreadChannel.TEAM }];
  if (u.role === Role.PLANNER) {
    or.push({ channel: { in: [ThreadChannel.CLIENT, ThreadChannel.VENDOR] }, OR: [{ weddingId: null }, { wedding: { plannerId: null } }, { wedding: { plannerId: u.id } }] }, { channel: ThreadChannel.PLANNER });
  }
  if (u.role === Role.FINANCE) or.push({ channel: ThreadChannel.PLANNER });
  if (u.role === Role.EVENT_MANAGER || u.role === Role.OPERATIONS) or.push({ channel: ThreadChannel.VENDOR });
  return { OR: or };
}

/** The same rules as staffThreadWhere, as a predicate (used to work out who to push a new message to). */
export function staffCanSee(u: { id: string; role: Role }, t: { channel: ThreadChannel; memberIds: string[]; hasWedding: boolean; weddingPlannerId?: string | null }): boolean {
  if (u.role === Role.ADMIN) return true;
  if (t.memberIds.includes(u.id) || t.channel === ThreadChannel.TEAM) return true;
  if (u.role === Role.PLANNER) {
    if (t.channel === ThreadChannel.PLANNER) return true;
    if (t.channel === ThreadChannel.CLIENT || t.channel === ThreadChannel.VENDOR) return !t.hasWedding || !t.weddingPlannerId || t.weddingPlannerId === u.id;
  }
  if (u.role === Role.FINANCE) return t.channel === ThreadChannel.PLANNER;
  if (u.role === Role.EVENT_MANAGER || u.role === Role.OPERATIONS) return t.channel === ThreadChannel.VENDOR;
  return false;
}
