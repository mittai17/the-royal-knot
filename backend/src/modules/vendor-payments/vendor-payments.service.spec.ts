import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VendorPaymentsService } from './vendor-payments.service';

const user = (role: string, id = role.toLowerCase()) => ({ id, email: `${id}@x`, name: id, role, mustChangePassword: false }) as never;
const row = (over: Record<string, unknown> = {}) => ({ id: 'p1', status: 'REQUESTED', amount: '40000', requestedById: 'maker', approvedById: null, approvalId: 'ap1', weddingId: 'w', billId: null, ...over });

function make(payment: Record<string, unknown> | null, limit = 100000) {
  const decide = jest.fn(async () => undefined);
  const update = jest.fn(async () => ({ count: 1 }));
  const prisma = {
    vendorPayment: { findUnique: async () => payment, updateMany: update },
    systemSetting: { findUnique: async () => ({ value: { vendorPayment: limit } }) },
    user: { findMany: async () => [] },
    approval: { findUnique: async () => null },
    vendorBillPayment: { findMany: async () => [] },
    activityLog: { findMany: async () => [] },
  };
  const audit = { log: jest.fn(async () => undefined) };
  const notif = { notify: jest.fn(async () => 0) };
  const svc = new VendorPaymentsService(prisma as never, audit as never, { decide } as never, notif as never, {} as never);
  return { svc, decide, update };
}

describe('VendorPaymentsService maker-checker', () => {
  it('404s an unknown payment', async () => {
    await expect(make(null).svc.approve('x', undefined, user('FINANCE'))).rejects.toThrow(NotFoundException);
  });
  it('never lets the requester approve or reject their own payment', async () => {
    const { svc, decide } = make(row());
    await expect(svc.approve('p1', undefined, user('FINANCE', 'maker'))).rejects.toThrow(/Maker-checker/);
    await expect(svc.reject('p1', 'no', user('FINANCE', 'maker'))).rejects.toThrow(ForbiddenException);
    expect(decide).not.toHaveBeenCalled();
  });
  it('lets another Finance user approve at or below the limit, but only the Founder above it', async () => {
    const small = make(row({ amount: '100000' }));
    await small.svc.approve('p1', 'ok', user('FINANCE', 'checker')).catch(() => undefined); // get() needs more than this stub; the decision is what matters
    expect(small.decide).toHaveBeenCalledWith('ap1', 'APPROVED', 'ok', expect.objectContaining({ id: 'checker' }));
    const big = make(row({ amount: '100000.01' }));
    await expect(big.svc.approve('p1', undefined, user('FINANCE', 'checker'))).rejects.toThrow(/Founder/);
    expect(big.decide).not.toHaveBeenCalled();
    const asFounder = make(row({ amount: '5000000' }));
    await asFounder.svc.approve('p1', undefined, user('FOUNDER', 'boss')).catch(() => undefined);
    expect(asFounder.decide).toHaveBeenCalled();
  });
  it('only approves a payment that is still REQUESTED', async () => {
    await expect(make(row({ status: 'PAID' })).svc.approve('p1', undefined, user('FINANCE', 'checker'))).rejects.toThrow(ConflictException);
  });
  it('refuses to execute an unapproved payment, and never by the person who approved it', async () => {
    await expect(make(row()).svc.execute('p1', {}, user('FINANCE', 'checker'))).rejects.toThrow(/not been approved/);
    await expect(make(row({ status: 'APPROVED', approvedById: 'checker', approvalId: null })).svc.execute('p1', {}, user('FINANCE', 'checker'))).rejects.toThrow(/approved this payment/);
    await expect(make(row({ status: 'APPROVED', approvedById: null, approvalId: null })).svc.execute('p1', {}, user('FINANCE', 'checker'))).rejects.toThrow(/no approval on record/);
  });
  it('the direct (legacy) path is Founder at any amount, Finance only up to the limit, nobody else', async () => {
    const { svc } = make(null, 50000);
    await expect(svc.assertDirectAllowed(user('FOUNDER'), 9_000_000)).resolves.toMatchObject({ mode: 'founder' });
    await expect(svc.assertDirectAllowed(user('FINANCE'), 50000)).resolves.toMatchObject({ mode: 'auto-approved' });
    await expect(svc.assertDirectAllowed(user('FINANCE'), '50000.01')).rejects.toThrow(/need an approved request/);
    await expect(svc.assertDirectAllowed(user('PLANNER'), 1)).rejects.toThrow(ForbiddenException);
    await expect(svc.assertDirectAllowed(user('SYSADMIN'), 1)).rejects.toThrow(ForbiddenException);
  });
});
