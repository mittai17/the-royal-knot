import { Prisma } from '@prisma/client';
import { byDesc, clientReceived, D, vendorPaid } from './finance';
import { FALLBACK_MILESTONE_TEMPLATE, milestonePlan, splitContract } from './milestones';

describe('vendor and client money rows', () => {
  it('counts only PAID vendor payments and subtracts reversal rows', () => {
    const rows = [
      { amount: 100, status: 'PAID' }, { amount: 50, status: 'REQUESTED' }, { amount: 70, status: 'FAILED' }, { amount: 25, status: 'CANCELLED' },
      { amount: 40, status: 'PAID', reversalOfId: 'x' }, { amount: '0.10', status: 'PAID' }, { amount: '0.20', status: 'PAID' },
    ];
    expect(vendorPaid(rows).toString()).toBe('60.3'); // 100 + 0.1 + 0.2 - 40, exact (no float drift)
  });
  it('counts SUCCEEDED client payments (and fully refunded originals, offset by their reversal) but not pending / failed attempts', () => {
    const rows = [
      { amount: 1000, status: 'SUCCEEDED' }, { amount: 500, status: 'PENDING' }, { amount: 500, status: 'FAILED' }, { amount: 500, status: 'PROCESSING' },
      { amount: 300, status: 'REFUNDED' }, { amount: 300, status: 'SUCCEEDED', reversalOfId: 'orig' }, // fully refunded payment and its reversal net to zero
      { amount: 100, status: 'SUCCEEDED', reversalOfId: 'other' }, // a partial refund on another payment
    ];
    expect(clientReceived(rows).toString()).toBe('900');
    expect(clientReceived([]).toString()).toBe('0');
  });
  it('sorts money as decimals, not floats', () => {
    const xs = [{ v: D('0.30000000000000004') }, { v: D('0.3') }, { v: D('12345678901234567.01') }];
    expect(xs.sort(byDesc((x) => x.v)).map((x) => x.v.toString())).toEqual(['12345678901234567.01', '0.30000000000000004', '0.3']);
  });
});

describe('milestone split is configuration, not a constant', () => {
  const db = (store: Record<string, unknown>) => ({ systemSetting: { findUnique: async ({ where }: { where: { key: string } }) => (where.key in store ? { value: store[where.key] } : null) } }) as never;
  const tpl = (b: number, a: number, f: number) => [{ type: 'BOOKING', percent: b }, { type: 'ADVANCE', percent: a }, { type: 'FINAL', percent: f }];

  it('prefers the contract plan, then the Business Settings template, then the fallback', async () => {
    expect((await milestonePlan(db({}), 'w1')).source).toBe('fallback');
    expect(await milestonePlan(db({}), 'w1')).toMatchObject({ plan: FALLBACK_MILESTONE_TEMPLATE });
    expect((await milestonePlan(db({ 'payment.milestones': tpl(30, 30, 40) }), 'w1')).source).toBe('business-settings');
    const both = await milestonePlan(db({ 'payment.milestones': tpl(30, 30, 40), 'payment.milestones.w1': tpl(10, 20, 70) }), 'w1');
    expect(both.source).toBe('contract'); expect(both.plan[0].percent).toBe(10);
    expect((await milestonePlan(db({ 'payment.milestones': tpl(30, 30, 40), 'payment.milestones.w1': tpl(10, 20, 70) }), 'w2')).source).toBe('business-settings');
  });
  it('ignores a malformed plan instead of trusting it', async () => {
    expect((await milestonePlan(db({ 'payment.milestones': [{ type: 'BOOKING', percent: 120 }] }))).source).toBe('fallback');
    expect((await milestonePlan(db({ 'payment.milestones': 'nope' }))).source).toBe('fallback');
  });
  it('splits any contract by the plan and makes FINAL absorb the remainder and approved extras so the parts always add up', () => {
    const s = splitContract(tpl(10, 20, 70) as never, '1000000.01', '5000');
    expect(s.BOOKING.toString()).toBe('100000'); // 10% rounded half-up to paise
    expect(s.ADVANCE.toString()).toBe('200000');
    expect(s.FINAL.toString()).toBe('705000.01');
    expect(s.BOOKING.plus(s.ADVANCE).plus(s.FINAL).toString()).toBe('1005000.01');
    const odd = splitContract(tpl(33.333, 33.333, 33.334) as never, 100);
    expect(odd.BOOKING.plus(odd.ADVANCE).plus(odd.FINAL).equals(new Prisma.Decimal(100))).toBe(true);
  });
});
