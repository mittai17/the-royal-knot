import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ALLOW_EXTERNAL, ROLES_KEY } from './decorators';
import { RolesGuard } from './guards';
import { ACTIONS, FOUNDER_DENIED, G, MODULES, PERMISSION_MATRIX, expandMatrix } from './permissions';

/** Effective grant for a role (write implies read, FOUNDER = everything except FOUNDER_DENIED). */
function can(role: Role, module: string, action: 'read' | 'write' | 'approve'): boolean {
  const row = expandMatrix().find((r) => r.role === role && r.module === module && r.action === action);
  return !!row?.allowed;
}
const canAll = (role: Role, grants: string[]) => grants.every((g) => can(role, g.split(':')[0], g.split(':')[1] as 'read'));
const cannotAny = (role: Role, grants: string[]) => grants.every((g) => !can(role, g.split(':')[0], g.split(':')[1] as 'read'));

describe('permission matrix vs master spec section 10', () => {
  it('covers every module and the three actions for all 8 roles', () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual(Object.values(Role).sort());
    expect(expandMatrix()).toHaveLength(8 * MODULES.length * ACTIONS.length);
    for (const m of ['vendor-payments', 'activity', 'business-settings', 'team-manage']) expect(MODULES).toContain(m);
  });

  it('FOUNDER: business oversight and approvals, but cannot modify posted accounting', () => {
    expect(canAll(Role.FOUNDER, ['business-settings:write', 'vendor-payments:approve', 'approvals:approve', 'team-manage:write', 'audit:read', 'budgets:read', 'ledger:read', 'ledger:approve']));
    expect(cannotAny(Role.FOUNDER, ['ledger:write']));
    expect(FOUNDER_DENIED).toEqual(['ledger:write']);
  });

  it('PLANNER: proposes only for finance, no approvals, no vendor payments, read-only invoices/payments', () => {
    expect(canAll(Role.PLANNER, ['weddings:write', 'procurement:write', 'proposals:write', 'approvals:write', 'expense-requests:write', 'invoices:read', 'payments:read', 'expenses:read', 'team:read', 'activity:write']));
    expect(cannotAny(Role.PLANNER, ['approvals:approve', 'invoices:write', 'payments:write', 'expenses:write', 'vendor-payments:read', 'vendor-payments:write', 'vendor-bills:read', 'ledger:write', 'business-settings:read', 'team-manage:write', 'audit:read']));
  });

  it('FINANCE: owns accounting, requests (never approves) payments, procurement is read-only', () => {
    expect(canAll(Role.FINANCE, ['payments:write', 'invoices:write', 'vendor-bills:write', 'vendor-payments:write', 'expenses:write', 'reconciliation:write', 'ledger:write', 'budgets:write', 'procurement:read', 'audit:read', 'clients:read']));
    expect(cannotAny(Role.FINANCE, ['procurement:write', 'vendor-payments:approve', 'approvals:approve', 'business-settings:read', 'team-manage:write', 'weddings:write', 'enquiries:read']));
  });

  it('EVENT_MANAGER: reports extra costs only, no finance, no approvals', () => {
    expect(canAll(Role.EVENT_MANAGER, ['events:write', 'incidents:write', 'arrivals:write', 'expense-requests:write', 'activity:write', 'weddings:read', 'vendors:read']));
    expect(cannotAny(Role.EVENT_MANAGER, ['approvals:write', 'approvals:approve', 'expenses:write', 'invoices:read', 'payments:read', 'vendor-payments:read', 'vendor-bills:read', 'budgets:read', 'clients:read', 'business-settings:read']));
  });

  it('OPERATIONS: assigned work only, no finance, no client or commercial records', () => {
    expect(canAll(Role.OPERATIONS, ['tasks:write', 'checklists:write', 'incidents:write', 'arrivals:write', 'activity:write', 'weddings:read', 'events:read']));
    expect(cannotAny(Role.OPERATIONS, ['clients:read', 'enquiries:read', 'proposals:read', 'quotations:read', 'procurement:read', 'invoices:read', 'payments:read', 'vendor-bills:read', 'vendor-payments:read', 'expenses:read', 'expense-requests:write', 'budgets:read', 'approvals:read', 'audit:read', 'team:read']));
  });

  it('CLIENT: own portal only, no staff modules', () => {
    expect(canAll(Role.CLIENT, ['portal-client:write', 'weddings:read', 'invoices:read', 'payments:read', 'agreements:read']));
    expect(cannotAny(Role.CLIENT, ['vendor-bills:read', 'vendor-payments:read', 'expenses:read', 'budgets:read', 'approvals:read', 'procurement:read', 'enquiries:read', 'clients:read', 'audit:read', 'portal-vendor:read', 'business-settings:read']));
  });

  it('VENDOR: own portal only, sees its own payments, nothing else financial', () => {
    expect(canAll(Role.VENDOR, ['portal-vendor:write', 'quotations:write', 'vendor-bills:write', 'vendor-payments:read']));
    expect(cannotAny(Role.VENDOR, ['vendor-payments:write', 'invoices:read', 'payments:read', 'expenses:read', 'budgets:read', 'approvals:read', 'clients:read', 'weddings:read', 'portal-client:read', 'audit:read']));
  });

  it('SYSADMIN: infrastructure and identity only, never business payments or approvals', () => {
    expect(canAll(Role.SYSADMIN, ['users:write', 'roles:write', 'config:write', 'integrations:write', 'storage:write', 'backups:write', 'monitoring:read', 'audit:read']));
    expect(cannotAny(Role.SYSADMIN, ['payments:read', 'invoices:read', 'vendor-bills:read', 'vendor-payments:read', 'expenses:read', 'budgets:read', 'approvals:write', 'approvals:approve', 'ledger:read', 'weddings:read', 'clients:read', 'business-settings:read', 'team-manage:write']));
  });

  it('only the Founder can approve anything', () => {
    for (const role of Object.values(Role)) if (role !== Role.FOUNDER) expect(expandMatrix().filter((r) => r.role === role && r.action === 'approve' && r.allowed)).toEqual([]);
  });
});

describe('RolesGuard default-deny', () => {
  const guardFor = (meta: { roles?: Role[]; external?: boolean }) => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => (key === ROLES_KEY ? meta.roles : key === ALLOW_EXTERNAL ? meta.external : undefined) as never);
    return new RolesGuard(reflector);
  };
  const ctx = (role: Role) => ({ getHandler: () => 1, getClass: () => 2, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as never;

  it('SYSADMIN, CLIENT and VENDOR are denied on a staff route with no @Roles', () => {
    for (const role of [Role.SYSADMIN, Role.CLIENT, Role.VENDOR]) expect(() => guardFor({}).canActivate(ctx(role))).toThrow(ForbiddenException);
  });
  it('they are denied on a route whose @Roles lists only staff', () => {
    for (const role of [Role.SYSADMIN, Role.CLIENT, Role.VENDOR]) expect(() => guardFor({ roles: G.STAFF }).canActivate(ctx(role))).toThrow(ForbiddenException);
  });
  it('they pass only when explicitly listed or the handler opts in', () => {
    expect(guardFor({ roles: G.SYSADMIN }).canActivate(ctx(Role.SYSADMIN))).toBe(true);
    expect(guardFor({ roles: G.CLIENT_PORTAL }).canActivate(ctx(Role.CLIENT))).toBe(true);
    expect(guardFor({ roles: G.VENDOR_PORTAL }).canActivate(ctx(Role.VENDOR))).toBe(true);
    expect(guardFor({ external: true }).canActivate(ctx(Role.VENDOR))).toBe(true);
  });
  it('staff routes stay open to staff and the Founder always passes', () => {
    expect(guardFor({}).canActivate(ctx(Role.OPERATIONS))).toBe(true);
    expect(guardFor({ roles: G.SYSADMIN }).canActivate(ctx(Role.FOUNDER))).toBe(true);
    expect(() => guardFor({ roles: G.SYSADMIN }).canActivate(ctx(Role.PLANNER))).toThrow(ForbiddenException);
  });
});
