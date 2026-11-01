import { ForbiddenException, Global, NotFoundException, Injectable, Module } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from './decorators';

const NOTHING = '00000000-0000-0000-0000-000000000000';
/** Staff roles whose wedding access is limited to their assignments. */
export const ASSIGNMENT_SCOPED_ROLES: Role[] = [Role.PLANNER, Role.EVENT_MANAGER, Role.OPERATIONS];

/**
 * Row-level scoping for external roles. Feature modules call these instead of re-implementing the rules:
 *  - CLIENT  -> only weddings of their own couple (User.coupleId)
 *  - VENDOR  -> only their own vendor record (User.vendorId) and the weddings they are booked / invited to quote on
 *  - PLANNER / EVENT_MANAGER / OPERATIONS -> only weddings they are ASSIGNED to (see assignment sources below)
 *  - FOUNDER, FINANCE -> every wedding (per the permission matrix); SYSADMIN is blocked from business routes by RolesGuard, not here
 *
 * Staff assignment sources (no dedicated table yet, see docs/SCHEMA_REQUESTS.md "WP2"): Wedding.plannerId, WeddingTask.ownerId
 * (the generated planning checklist hands tasks to event managers / operations) and Incident.assignedToId.
 * OPERATIONS is narrower still: only tasks it owns (taskWhere).
 *
 * Usage:   where: { ...this.scope.weddingWhere(user), status }          // on Wedding
 *          where: { ...(await this.scope.byWeddingId(user)), category }  // on any model with weddingId
 *          where: { ...this.scope.byVendorId(user) }                     // on any model with vendorId (RFQs, bills, POs, reviews)
 */
@Injectable()
export class ScopeService {
  constructor(private prisma: PrismaService) {}

  isClient(u: AuthUser) { return u.role === Role.CLIENT; }
  isVendor(u: AuthUser) { return u.role === Role.VENDOR; }
  isStaffScoped(u: AuthUser) { return ASSIGNMENT_SCOPED_ROLES.includes(u.role); }
  /** True for roles that must be row-scoped (external portals and assignment-scoped staff). */
  isScoped(u: AuthUser) { return u.role === Role.CLIENT || u.role === Role.VENDOR || this.isStaffScoped(u); }

  /** Prisma `where` for the Wedding model. */
  weddingWhere(u: AuthUser): Prisma.WeddingWhereInput {
    if (u.role === Role.CLIENT) return { coupleId: u.coupleId ?? NOTHING };
    if (u.role === Role.VENDOR) {
      const vendorId = u.vendorId ?? NOTHING;
      // an RFQ the planner has only prepared (DRAFT) is not visible to the vendor yet
      return { OR: [{ weddingVendors: { some: { vendorId } } }, { requests: { some: { vendorId, status: { not: 'DRAFT' } } } }] };
    }
    if (this.isStaffScoped(u)) return { OR: [{ plannerId: u.id }, { tasks: { some: { ownerId: u.id } } }, { incidents: { some: { assignedToId: u.id } } }] };
    return {};
  }

  /** Ids of the weddings the user may see, or null when unrestricted. */
  async weddingIds(u: AuthUser): Promise<string[] | null> {
    if (!this.isScoped(u)) return null;
    return (await this.prisma.wedding.findMany({ where: this.weddingWhere(u), select: { id: true } })).map((w) => w.id);
  }

  /** `{ weddingId: { in: [...] } }` for any model that has a weddingId column; `{}` when unrestricted. */
  async byWeddingId(u: AuthUser): Promise<{ weddingId?: { in: string[] } }> {
    const ids = await this.weddingIds(u);
    return ids ? { weddingId: { in: ids } } : {};
  }

  /** `{ vendorId }` for VENDOR users (matches nothing when unlinked); `{}` for everyone else. */
  byVendorId(u: AuthUser): { vendorId?: string } {
    return u.role === Role.VENDOR ? { vendorId: u.vendorId ?? NOTHING } : {};
  }

  /** 403 unless the user may see this wedding. */
  async assertWeddingAccess(u: AuthUser, weddingId: string): Promise<void> {
    if (!this.isScoped(u)) return;
    const ok = await this.prisma.wedding.count({ where: { id: weddingId, ...this.weddingWhere(u) } });
    if (!ok) {
      // staff: an id that does not exist at all is a plain 404; an existing but unassigned wedding is 403. CLIENT / VENDOR always get 403 (no probing).
      if (this.isStaffScoped(u) && !(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
      throw new ForbiddenException('You do not have access to this wedding');
    }
  }

  /** `where` for WeddingTask: OPERATIONS only sees tasks it owns; other scoped roles see the tasks of the weddings they may access. */
  taskWhere(u: AuthUser): Prisma.WeddingTaskWhereInput {
    if (u.role === Role.OPERATIONS) return { ownerId: u.id };
    if (this.isScoped(u)) return { wedding: this.weddingWhere(u) };
    return {};
  }

  /** 403 unless the user may see this task (IDOR guard for /tasks/:id). */
  async assertTaskAccess(u: AuthUser, taskId: string): Promise<void> {
    if (!this.isScoped(u)) return;
    const ok = await this.prisma.weddingTask.count({ where: { id: taskId, ...this.taskWhere(u) } });
    if (!ok) throw new ForbiddenException('You do not have access to this task');
  }

  /** Non-throwing wedding access check (used by the websocket gateway). */
  async canAccessWedding(u: { id: string; role: Role; vendorId?: string | null; coupleId?: string | null }, weddingId: string): Promise<boolean> {
    if (u.role === Role.SYSADMIN) return false;
    const where = this.isScoped(u as AuthUser) ? { id: weddingId, ...this.weddingWhere(u as AuthUser) } : { id: weddingId };
    return (await this.prisma.wedding.count({ where })) > 0;
  }

  /** 403 unless the user may act on this vendor record. */
  assertVendorAccess(u: AuthUser, vendorId: string): void {
    if (u.role === Role.VENDOR && u.vendorId !== vendorId) throw new ForbiddenException('You do not have access to this vendor');
  }

  /** The vendor / wedding a portal user is bound to; throws if the account is not linked. */
  requireVendorId(u: AuthUser): string {
    if (!u.vendorId) throw new ForbiddenException('This account is not linked to a vendor');
    return u.vendorId;
  }
  async requireClientWeddingIds(u: AuthUser): Promise<string[]> {
    if (!u.coupleId) throw new ForbiddenException('This account is not linked to a couple');
    return (await this.weddingIds(u)) ?? [];
  }
}

@Global() @Module({ providers: [ScopeService], exports: [ScopeService] })
export class ScopeModule {}
