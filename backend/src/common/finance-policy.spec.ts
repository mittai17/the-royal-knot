import { ConflictException, ForbiddenException } from '@nestjs/common';
import { above, assertDifferentPerson, assertIndependent, creatorOf, DEFAULT_LIMITS, financeLimits } from './finance-policy';

const db = (value?: unknown, log?: { actorId: string | null }) => ({
  systemSetting: { findUnique: async () => (value === undefined ? null : { key: 'approval.limits', value }) },
  activityLog: { findFirst: async () => log ?? null },
}) as never;

describe('finance policy', () => {
  it('uses the Business Settings limits, falling back to defaults for anything missing or invalid', async () => {
    expect(await financeLimits(db())).toEqual(DEFAULT_LIMITS);
    const l = await financeLimits(db({ vendorPayment: 25000, extraExpense: 'lots', clientDiscount: -5 }));
    expect(l.vendorPayment).toBe(25000);
    expect(l.extraExpense).toBe(DEFAULT_LIMITS.extraExpense);
    expect(l.clientDiscount).toBe(DEFAULT_LIMITS.clientDiscount);
  });
  it('compares amounts with decimals, "above" is strictly greater', () => {
    expect(above('100000.01', 100000)).toBe(true);
    expect(above(100000, 100000)).toBe(false);
    expect(above('0.1', 0)).toBe(true);
  });
  it('rejects the same person as maker and checker with a Maker-checker message (403)', () => {
    expect(() => assertDifferentPerson('u1', 'u1', 'you raised it')).toThrow(ForbiddenException);
    expect(() => assertDifferentPerson('u1', 'u1', 'you raised it')).toThrow(/Maker-checker: you raised it/);
    expect(() => assertDifferentPerson('u1', 'u2', 'x')).not.toThrow();
    expect(() => assertDifferentPerson('u1', null, 'x')).not.toThrow(); // seeded / legacy rows have no maker
  });
  it('requires every earlier stage to be someone else (409) and names the stage', () => {
    const prior = [{ label: 'submitted', userId: 'a' }, { label: 'verified', userId: 'b' }];
    expect(() => assertIndependent('c', prior, 'approve')).not.toThrow();
    expect(() => assertIndependent('a', prior, 'approve')).toThrow(ConflictException);
    expect(() => assertIndependent('b', prior, 'approve')).toThrow(/you verified this record/);
  });
  it('finds the creator in the audit trail', async () => {
    expect(await creatorOf(db(undefined, { actorId: 'u9' }), 'Expense', 'e1')).toBe('u9');
    expect(await creatorOf(db(), 'Expense', 'e1')).toBeNull();
  });
});
