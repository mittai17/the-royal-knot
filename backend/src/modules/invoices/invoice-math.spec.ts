import { computeInvoice, invoiceStatus, nextNumber, outstanding } from './invoice-math';

describe('computeInvoice', () => {
  it('totals lines, tax and discount with decimal precision', () => {
    const r = computeInvoice([{ description: 'Planning fee', quantity: 1, unitPrice: 100000, taxRate: 18 }, { description: 'Coordination', quantity: 3, unitPrice: 0.1, taxRate: 0 }, { description: 'Misc', quantity: 3, unitPrice: 0.2 }], 5000);
    expect(r.subtotal.toString()).toBe('100000.9');
    expect(r.taxTotal.toString()).toBe('18000');
    expect(r.total.toString()).toBe('113000.9');
  });
  it('rounds tax half-up per line', () => {
    expect(computeInvoice([{ description: 'x', quantity: 1, unitPrice: 10.05, taxRate: 5 }]).taxTotal.toString()).toBe('0.5');
  });
  it('rejects a discount larger than the invoice', () => {
    expect(() => computeInvoice([{ description: 'x', quantity: 1, unitPrice: 100 }], 101)).toThrow(RangeError);
  });
});

describe('invoiceStatus', () => {
  const due = new Date('2026-11-10T00:00:00Z');
  const base = { total: 1000, amountPaid: 0, dueDate: due };
  it('keeps draft and void', () => {
    expect(invoiceStatus({ ...base, status: 'DRAFT' })).toBe('DRAFT');
    expect(invoiceStatus({ ...base, status: 'VOID' }, new Date('2030-01-01'))).toBe('VOID');
  });
  it('sent -> partially paid -> paid', () => {
    const now = new Date('2026-11-01');
    expect(invoiceStatus({ ...base, status: 'SENT' }, now)).toBe('SENT');
    expect(invoiceStatus({ ...base, status: 'SENT', amountPaid: 400 }, now)).toBe('PARTIALLY_PAID');
    expect(invoiceStatus({ ...base, status: 'SENT', amountPaid: 1000 }, now)).toBe('PAID');
  });
  it('is overdue once the due day has passed, unless fully paid', () => {
    const late = new Date('2026-11-12');
    expect(invoiceStatus({ ...base, status: 'SENT', amountPaid: 400 }, late)).toBe('OVERDUE');
    expect(invoiceStatus({ ...base, status: 'SENT', amountPaid: 1000 }, late)).toBe('PAID');
  });
});

describe('numbering & balance', () => {
  it('increments per year', () => {
    expect(nextNumber('INV', null, 2026)).toBe('INV-2026-0001');
    expect(nextNumber('INV', 'INV-2026-0042', 2026)).toBe('INV-2026-0043');
  });
  it('never reports a negative balance', () => { expect(outstanding(100, 150).toString()).toBe('0'); });
});
