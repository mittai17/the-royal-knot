import { billOutstanding, billStatus, matchAgainstPo } from './bill-math';

describe('billStatus', () => {
  const due = new Date('2026-11-10T00:00:00Z');
  it('flags unpaid bills past due as overdue, but never paid or rejected ones', () => {
    const late = new Date('2026-11-20');
    expect(billStatus({ status: 'APPROVED', total: 100, amountPaid: 0, dueDate: due }, late)).toBe('OVERDUE');
    expect(billStatus({ status: 'SUBMITTED', total: 100, amountPaid: 0, dueDate: due }, late)).toBe('OVERDUE');
    expect(billStatus({ status: 'PAID', total: 100, amountPaid: 100, dueDate: due }, late)).toBe('PAID');
    expect(billStatus({ status: 'REJECTED', total: 100, amountPaid: 0, dueDate: due }, late)).toBe('REJECTED');
  });
  it('keeps workflow state while not due', () => {
    expect(billStatus({ status: 'VERIFIED', total: 100, amountPaid: 0, dueDate: due }, new Date('2026-11-01'))).toBe('VERIFIED');
  });
});

describe('matchAgainstPo', () => {
  it('returns nulls without a PO', () => { expect(matchAgainstPo(100).matched).toBeNull(); });
  it('allows 1% tolerance and reports variance', () => {
    expect(matchAgainstPo(100500, { total: 100000, billed: 0 }).matched).toBe(true);
    const r = matchAgainstPo(105000, { total: 100000, billed: 20000 });
    expect(r.matched).toBe(false);
    expect(r.variance!.toString()).toBe('5000');
    expect(r.remaining!.toString()).toBe('80000');
  });
  it('outstanding never goes negative', () => { expect(billOutstanding(100, 120).toString()).toBe('0'); });
});
