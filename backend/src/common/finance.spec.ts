import { clientBilling, computeQuotation, D, extraGuestCharge, milestoneStatus, profitability, rankQuotations, vendorSettlement } from './finance';

describe('computeQuotation', () => {
  it('computes subtotal, tax, additional and grand total with decimal precision', () => {
    const r = computeQuotation([
      { quantity: 400, unitPrice: 1200, taxRate: 5 },
      { quantity: 6, unitPrice: 25000, taxRate: 18, additionalCharge: 1000 },
    ], 400);
    expect(r.subtotal.toString()).toBe('630000');
    expect(r.taxTotal.toString()).toBe('51000'); // 24,000 + 27,000
    expect(r.additionalTotal.toString()).toBe('1000');
    expect(r.grandTotal.toString()).toBe('682000');
    expect(r.pricePerPlate!.toString()).toBe('1705');
  });
  it('excludes "not included" lines from every total', () => {
    const r = computeQuotation([{ quantity: 1, unitPrice: 100, taxRate: 18 }, { quantity: 1, unitPrice: 999999, taxRate: 18, included: false }], null);
    expect(r.grandTotal.toString()).toBe('118');
    expect(r.pricePerPlate).toBeNull();
  });
  it('does not accumulate float error (0.1 + 0.2 style)', () => {
    const r = computeQuotation([{ quantity: 3, unitPrice: 0.1 }, { quantity: 3, unitPrice: 0.2 }], null);
    expect(r.grandTotal.toString()).toBe('0.9');
  });
  it('rounds tax half-up to paise', () => {
    expect(computeQuotation([{ quantity: 1, unitPrice: 10.05, taxRate: 5 }], null).taxTotal.toString()).toBe('0.5');
    expect(computeQuotation([{ quantity: 1, unitPrice: 0.1, taxRate: 5 }], null).taxTotal.toString()).toBe('0.01');
  });
  it('guards price-per-plate against zero guests', () => {
    expect(computeQuotation([{ quantity: 1, unitPrice: 100 }], 0).pricePerPlate).toBeNull();
  });
});

describe('extraGuestCharge', () => {
  it('60 extra guests × ₹1,200 = ₹72,000 (the reference scenario)', () => {
    const r = extraGuestCharge(400, 460, 1200);
    expect(r.extraGuests).toBe(60);
    expect(r.amount.toString()).toBe('72000');
  });
  it('never charges when attendance is lower than expected', () => {
    expect(extraGuestCharge(400, 380, 1200).amount.toString()).toBe('0');
    expect(extraGuestCharge(400, 400, 1200).extraGuests).toBe(0);
  });
  it('handles fractional rates', () => {
    expect(extraGuestCharge(100, 103, '1199.99').amount.toString()).toBe('3599.97');
  });
});

describe('milestoneStatus', () => {
  const now = new Date('2026-03-10T10:00:00Z');
  const d = (days: number) => new Date(now.getTime() + days * 864e5);
  it('PAID when fully received, even if late', () => expect(milestoneStatus(1000, 1000, d(-30), now)).toBe('PAID'));
  it('PAID tolerates over-receipt', () => expect(milestoneStatus(1000, 1200, d(5), now)).toBe('PAID'));
  it('UPCOMING when due far away', () => expect(milestoneStatus(1000, 0, d(30), now)).toBe('UPCOMING'));
  it('DUE inside the 7-day window', () => expect(milestoneStatus(1000, 0, d(5), now)).toBe('DUE'));
  it('PARTIALLY_PAID before the due date', () => expect(milestoneStatus(1000, 400, d(20), now)).toBe('PARTIALLY_PAID'));
  it('OVERDUE when past due and unpaid', () => expect(milestoneStatus(1000, 0, d(-3), now)).toBe('OVERDUE'));
  it('OVERDUE (not partially paid) when past due with a partial payment', () => expect(milestoneStatus(1000, 400, d(-3), now)).toBe('OVERDUE'));
  it('a zero-value milestone is never auto-PAID', () => expect(milestoneStatus(0, 0, d(30), now)).toBe('UPCOMING'));
});

describe('vendorSettlement', () => {
  it('uses negotiated + approved extras when no invoice exists', () => {
    const r = vendorSettlement({ original: 1500000, negotiated: 1576000, approvedExtras: 72000, paid: 709200, advance: 709200 });
    expect(r.finalBill.toString()).toBe('1648000');
    expect(r.remainingPayable.toString()).toBe('938800');
  });
  it('actual invoice overrides the estimate (assumed to include extras)', () => {
    const r = vendorSettlement({ original: 100, negotiated: 100, actualInvoice: 130, approvedExtras: 30, paid: 40, advance: 40 });
    expect(r.finalBill.toString()).toBe('130');
    expect(r.remainingPayable.toString()).toBe('90');
  });
  it('never reports a negative payable; surfaces the overpayment instead', () => {
    const r = vendorSettlement({ original: 100, negotiated: 100, approvedExtras: 0, paid: 120, advance: 120 });
    expect(r.remainingPayable.toString()).toBe('0');
    expect(r.overpaid.toString()).toBe('20');
  });
  it('fully settled → zero remaining', () => {
    expect(vendorSettlement({ original: 100, negotiated: 100, approvedExtras: 0, paid: 100, advance: 40 }).remainingPayable.toString()).toBe('0');
  });
});

describe('clientBilling', () => {
  it('final = contract + approved extras; outstanding = final − received', () => {
    const r = clientBilling({ contractValue: 13500000, approvedExtras: 102000, received: 8100000 });
    expect(r.finalAmount.toString()).toBe('13602000');
    expect(r.outstanding.toString()).toBe('5502000');
  });
  it('clamps outstanding at zero on over-payment', () => expect(clientBilling({ contractValue: 100, approvedExtras: 0, received: 150 }).outstanding.toString()).toBe('0'));
});

describe('profitability', () => {
  const base = { revenue: 13530000, vendorCosts: 10998000, teamCosts: 146000, otherExpenses: 504000, received: 8100000, vendorPaid: 5029700 };
  it('derives gross, net, margin, receivables and payables', () => {
    const p = profitability(base);
    expect(p.grossProfit.toString()).toBe('2532000');
    expect(p.netProfit.toString()).toBe('1882000');
    expect(p.marginPct).toBe(13.9);
    expect(p.receivables.toString()).toBe('5430000');
    expect(p.payables.toString()).toBe('5968300');
  });
  it('reports a loss with a negative margin', () => {
    const p = profitability({ ...base, revenue: 1000000, vendorCosts: 1200000, teamCosts: 0, otherExpenses: 0 });
    expect(p.netProfit.toString()).toBe('-200000');
    expect(p.marginPct).toBe(-20);
  });
  it('zero revenue does not divide by zero', () => expect(profitability({ ...base, revenue: 0 }).marginPct).toBe(0));
});

describe('rankQuotations', () => {
  const q = (id: string, total: number, rating: number, inc: number, cap = true) => ({ id, grandTotal: total, rating, includedCount: inc, totalCount: 6, capacityOk: cap });
  it('recommends a pricier quote when the cheapest cannot seat the guests or drops services', () => {
    const r = rankQuotations([q('cheap', 1000000, 3.9, 4, false), q('mid', 1300000, 4.4, 6), q('royal', 1200000, 4.7, 6)]);
    expect(r.lowestId).toBe('cheap');
    expect(r.recommendedId).toBe('royal');
    expect(r.bestValueId).toBe('royal');
  });
  it('best value and recommended can differ', () => {
    const r = rankQuotations([q('a', 900000, 3.0, 6), q('b', 1000000, 5, 6)]);
    expect(r.lowestId).toBe('a');
    expect(r.bestValueId).toBe('a');
    expect(r.recommendedId).toBe('b');
  });
  it('handles an empty set', () => expect(rankQuotations([]).recommendedId).toBeNull());
  it('works with a single quote', () => expect(rankQuotations([q('only', 5, 4, 3)]).recommendedId).toBe('only'));
});

describe('Decimal helper', () => { it('D(null) is zero', () => expect(D(null).toString()).toBe('0')); });
