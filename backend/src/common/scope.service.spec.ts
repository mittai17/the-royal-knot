import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScopeService } from './scope.service';

const u = (role: string, extra: object = {}) => ({ id: `${role}-1`, role, email: '', name: '', mustChangePassword: false, ...extra }) as never;
const make = (counts: number[] = []) => {
  const count = jest.fn();
  counts.forEach((c) => count.mockResolvedValueOnce(c));
  const prisma = { wedding: { count, findMany: jest.fn().mockResolvedValue([{ id: 'w1' }]) }, weddingTask: { count: jest.fn().mockResolvedValue(0) } };
  return { scope: new ScopeService(prisma as never), prisma };
};

describe('ScopeService staff assignment scoping', () => {
  it('FOUNDER and FINANCE are unrestricted; PLANNER / EVENT_MANAGER / OPERATIONS / CLIENT / VENDOR are row-scoped', () => {
    const { scope } = make();
    for (const r of ['FOUNDER', 'FINANCE', 'SYSADMIN']) { expect(scope.isScoped(u(r))).toBe(false); expect(scope.weddingWhere(u(r))).toEqual({}); }
    for (const r of ['PLANNER', 'EVENT_MANAGER', 'OPERATIONS', 'CLIENT', 'VENDOR']) expect(scope.isScoped(u(r))).toBe(true);
  });
  it('staff are limited to weddings they plan, own tasks on, or are assigned incidents of', () => {
    const { scope } = make();
    expect(scope.weddingWhere(u('PLANNER'))).toEqual({ OR: [{ plannerId: 'PLANNER-1' }, { tasks: { some: { ownerId: 'PLANNER-1' } } }, { incidents: { some: { assignedToId: 'PLANNER-1' } } }] });
    expect(scope.weddingWhere(u('OPERATIONS'))).toHaveProperty('OR');
  });
  it('clients are limited to their couple; vendors to booked / invited weddings, and a DRAFT (unsent) RFQ does not count', () => {
    const { scope } = make();
    expect(scope.weddingWhere(u('CLIENT', { coupleId: 'c1' }))).toEqual({ coupleId: 'c1' });
    const w = scope.weddingWhere(u('VENDOR', { vendorId: 'v1' })) as { OR: { requests?: { some: { status: unknown } } }[] };
    expect(w.OR[1].requests!.some.status).toEqual({ not: 'DRAFT' });
  });
  it('OPERATIONS only sees its own tasks; other scoped roles see the tasks of their weddings; unrestricted roles see all', () => {
    const { scope } = make();
    expect(scope.taskWhere(u('OPERATIONS'))).toEqual({ ownerId: 'OPERATIONS-1' });
    expect(scope.taskWhere(u('EVENT_MANAGER'))).toHaveProperty('wedding');
    expect(scope.taskWhere(u('FINANCE'))).toEqual({});
  });
  it('assertWeddingAccess: 403 for an unassigned staff member on an existing wedding, 404 when the id does not exist, always 403 for clients', async () => {
    await expect(make([0, 1]).scope.assertWeddingAccess(u('PLANNER'), 'w')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(make([0, 0]).scope.assertWeddingAccess(u('PLANNER'), 'w')).rejects.toBeInstanceOf(NotFoundException);
    await expect(make([0]).scope.assertWeddingAccess(u('CLIENT', { coupleId: 'c' }), 'w')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(make([1]).scope.assertWeddingAccess(u('PLANNER'), 'w')).resolves.toBeUndefined();
    await expect(make().scope.assertWeddingAccess(u('FINANCE'), 'w')).resolves.toBeUndefined(); // no query at all
  });
  it('canAccessWedding never lets SYSADMIN in and is non-throwing', async () => {
    expect(await make().scope.canAccessWedding({ id: 's', role: 'SYSADMIN' } as never, 'w')).toBe(false);
    expect(await make([0]).scope.canAccessWedding({ id: 'p', role: 'PLANNER' } as never, 'w')).toBe(false);
    expect(await make([1]).scope.canAccessWedding({ id: 'p', role: 'PLANNER' } as never, 'w')).toBe(true);
  });
});
