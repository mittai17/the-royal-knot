import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScopeService } from '../../common/scope.service';
import { PortalVendorService } from './portal-vendor.service';

const vendorUser = { id: 'u1', role: 'VENDOR', vendorId: 'v1', email: '', name: '', mustChangePassword: false } as never;
const item = { name: 'Plate', quantity: 10, unit: 'plate', unitPrice: 100 };

function build(request: Record<string, unknown> | null) {
  const prisma = { quotationRequest: { findUnique: jest.fn().mockResolvedValue(request) } };
  const quotations = { submit: jest.fn().mockResolvedValue({ id: 'q1', grandTotal: { toString: () => '1000' } }) };
  const audit = { log: jest.fn() };
  const svc = new PortalVendorService(prisma as never, new ScopeService(prisma as never), audit as never, quotations as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, quotations, audit };
}
const req = (over: Record<string, unknown> = {}) => ({ id: 'r1', vendorId: 'v1', weddingId: 'w1', status: 'REQUESTED', quotation: null, ...over });

describe('PortalVendorService.submitQuotation', () => {
  it('hides RFQs that belong to another vendor behind a 404', async () => {
    const { svc, quotations } = build(req({ vendorId: 'someone-else' }));
    await expect(svc.submitQuotation(vendorUser, 'r1', { items: [item] })).rejects.toBeInstanceOf(NotFoundException);
    expect(quotations.submit).not.toHaveBeenCalled();
  });
  it('rejects closed RFQs, past validity dates and unpriced quotes', async () => {
    await expect(build(req({ status: 'ACCEPTED' })).svc.submitQuotation(vendorUser, 'r1', { items: [item] })).rejects.toBeInstanceOf(ConflictException);
    await expect(build(req()).svc.submitQuotation(vendorUser, 'r1', { validUntil: '2020-01-01', items: [item] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(req()).svc.submitQuotation(vendorUser, 'r1', { items: [{ ...item, unitPrice: 0 }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(req()).svc.submitQuotation(vendorUser, 'r1', { items: [{ ...item, name: '  ' }] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('never forwards a vendor-supplied rating to the quotations service', async () => {
    const { svc, quotations } = build(req());
    await svc.submitQuotation(vendorUser, 'r1', { items: [item], rating: 5 } as never);
    expect(quotations.submit).toHaveBeenCalledWith('r1', expect.objectContaining({ rating: undefined }), vendorUser);
  });
  it('rejects accounts that are not linked to a vendor', async () => {
    const { svc } = build(req());
    expect(() => svc.submitQuotation({ ...(vendorUser as object), vendorId: null } as never, 'r1', { items: [item] })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
