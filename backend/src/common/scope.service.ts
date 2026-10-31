import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from './decorators';

const NOTHING = '00000000-0000-0000-0000-000000000000';

/**
 * Row-level scoping for external roles. Feature modules call these instead of re-implementing the rules:
 *  - CLIENT  -> only weddings of their own couple (User.coupleId)
 *  - VENDOR  -> only their own vendor record (User.vendorId) and the weddings they are booked / invited to quote on
 *  - everyone else (ADMIN, staff, SYSADMIN) -> unchanged (SYSADMIN is blocked from business routes by RolesGuard, not here)
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
  /** True for roles that must be row-scoped. */
  isScoped(u: AuthUser) { return u.role === Role.CLIENT || u.role === Role.VENDOR; }

  /** Prisma `where` for the Wedding model. */
  weddingWhere(u: AuthUser): Prisma.WeddingWhereInput {
    if (u.role === Role.CLIENT) return { coupleId: u.coupleId ?? NOTHING };
    if (u.role === Role.VENDOR) {
      const vendorId = u.vendorId ?? NOTHING;
      return { OR: [{ weddingVendors: { some: { vendorId } } }, { requests: { some: { vendorId } } }] };
    }
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
    if (!ok) throw new ForbiddenException('You do not have access to this wedding');
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
