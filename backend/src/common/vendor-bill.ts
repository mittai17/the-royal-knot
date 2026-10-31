import { Prisma, PrismaClient } from '@prisma/client';
import { D, sum, vendorSettlement } from './finance';

type Client = PrismaClient | Prisma.TransactionClient;

/** Single source of truth for what a wedding vendor is owed — used by payments, reconciliation and analytics. */
export async function vendorBill(db: Client, weddingVendorId: string) {
  const wv = await db.weddingVendor.findUniqueOrThrow({ where: { id: weddingVendorId }, include: { settlement: true, payments: true, vendor: { select: { name: true } } } });
  const extras = await db.additionalCharge.findMany({ where: { weddingVendorId, approved: true, reconciliation: { weddingId: wv.weddingId } } });
  const q = wv.quotationId ? await db.quotation.findUnique({ where: { id: wv.quotationId }, select: { grandTotal: true } }) : null;
  const calc = vendorSettlement({
    original: q?.grandTotal ?? wv.contractAmount, negotiated: wv.negotiatedAmount ?? wv.contractAmount, actualInvoice: wv.settlement?.actualInvoice ?? null,
    approvedExtras: sum(extras.map((e) => e.amount)), paid: sum(wv.payments.map((p) => p.amount)), advance: sum(wv.payments.filter((p) => p.kind === 'ADVANCE').map((p) => p.amount)),
  });
  return { wv, ...calc };
}

export const dec = D;
