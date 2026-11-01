import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientReceived, D, money, sum, vendorPaid, vendorSettlement } from '../../common/finance';
import { PrismaService } from '../../database/prisma.service';
import { matchAgainstPo } from '../vendor-bills/bill-math';

export type QueueType =
  | 'DUPLICATE_BILL_REF' | 'POSSIBLE_DUPLICATE_BILL' | 'BILL_PO_MISMATCH' | 'PO_OVERBILLED' | 'PO_QUOTATION_MISMATCH' | 'QTY_DIFF' | 'RATE_DIFF'
  | 'UNAPPROVED_EXTRA' | 'VENDOR_OVERPAYMENT' | 'BILL_OVERPAID' | 'CLIENT_OVERPAYMENT' | 'INVOICE_OVERPAID'
  | 'CLIENT_PAYMENT_UNVERIFIED' | 'GATEWAY_UNSETTLED' | 'GATEWAY_FAILED' | 'ADVANCE_UNMATCHED' | 'VENDOR_PAYMENT_FAILED';
export type Severity = 'high' | 'medium' | 'low';
export interface QueueItem {
  type: QueueType; severity: Severity; weddingId: string | null; wedding: string | null; vendor: string | null; reference: string; detail: string;
  expected: Prisma.Decimal | null; actual: Prisma.Decimal | null; difference: Prisma.Decimal | null; at: Date | null; link: string;
}
const SEV: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const day = 864e5;

/**
 * The reconciliation queue: every place where quotation, purchase order, vendor bill, advances, approved extras and the money actually moved disagree.
 * Read-only. It never edits anything; fixing an item happens on the source record (bill, payment, charge) so the audit trail stays honest.
 */
@Injectable()
export class ReconciliationQueueService {
  constructor(private prisma: PrismaService) {}

  async queue(q: { weddingId?: string; type?: string; severity?: string } = {}) {
    const wf = q.weddingId ? { weddingId: q.weddingId } : {};
    const now = Date.now();
    const [bills, pos, wvs, charges, ms, invs, cpays, vpays] = await Promise.all([
      this.prisma.vendorBill.findMany({ where: { ...wf, status: { not: 'REJECTED' } }, include: { vendor: { select: { name: true } }, wedding: { select: { name: true } } } }),
      this.prisma.purchaseOrder.findMany({ where: { ...wf, status: { not: 'CANCELLED' } }, include: { lines: true, vendor: { select: { name: true } }, wedding: { select: { name: true } } } }),
      this.prisma.weddingVendor.findMany({ where: wf, include: { vendor: { select: { name: true } }, wedding: { select: { name: true } }, settlement: true, payments: { select: { amount: true, kind: true, status: true, reversalOfId: true, billId: true } } } }),
      this.prisma.additionalCharge.findMany({ where: q.weddingId ? { reconciliation: { weddingId: q.weddingId } } : {}, include: { reconciliation: { select: { weddingId: true, wedding: { select: { name: true } } } } } }),
      this.prisma.paymentMilestone.findMany({ where: { ...wf, wedding: { status: { not: 'CANCELLED' } } }, include: { payments: { select: { amount: true, status: true, reversalOfId: true } }, wedding: { select: { name: true } } } }),
      this.prisma.clientInvoice.findMany({ where: { ...wf, status: { not: 'CANCELLED' } }, include: { wedding: { select: { name: true } } } }),
      this.prisma.clientPayment.findMany({ where: { ...wf, OR: [{ status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } }, { status: 'SUCCEEDED', reversalOfId: null, verifiedAt: null }] }, include: { wedding: { select: { name: true } }, milestone: { select: { type: true } } } }),
      this.prisma.vendorPayment.findMany({ where: { ...wf, status: 'FAILED' }, include: { wedding: { select: { name: true } }, weddingVendor: { select: { vendor: { select: { name: true } } } } } }),
    ]);
    const items: QueueItem[] = [];
    const add = (i: Omit<QueueItem, 'difference'> & { difference?: Prisma.Decimal | null }) => items.push({ ...i, difference: i.difference ?? (i.expected && i.actual ? money(D(i.actual).minus(i.expected)) : null) });

    // 1. duplicate bill references
    const byRef = new Map<string, typeof bills>();
    const byAmt = new Map<string, typeof bills>();
    for (const b of bills) {
      const k = `${b.vendorId}|${norm(b.billNo)}`; byRef.set(k, [...(byRef.get(k) ?? []), b]);
      const a = `${b.vendorId}|${D(b.total).toFixed(2)}|${b.billDate.toISOString().slice(0, 10)}`; byAmt.set(a, [...(byAmt.get(a) ?? []), b]);
    }
    const flagged = new Set<string>();
    for (const g of byRef.values()) if (g.length > 1) for (const b of g) { flagged.add(b.id); add({ type: 'DUPLICATE_BILL_REF', severity: 'high', weddingId: b.weddingId, wedding: b.wedding?.name ?? null, vendor: b.vendor.name, reference: b.billNo, detail: `${g.length} bills from ${b.vendor.name} share the reference "${b.billNo}" (ignoring case and punctuation)`, expected: null, actual: D(b.total), at: b.createdAt, link: `/vendor-bills?search=${encodeURIComponent(b.billNo)}` }); }
    for (const g of byAmt.values()) if (g.length > 1) for (const b of g) if (!flagged.has(b.id)) add({ type: 'POSSIBLE_DUPLICATE_BILL', severity: 'medium', weddingId: b.weddingId, wedding: b.wedding?.name ?? null, vendor: b.vendor.name, reference: b.billNo, detail: `${g.length} bills from ${b.vendor.name} have the same amount and date but different references`, expected: null, actual: D(b.total), at: b.createdAt, link: `/vendor-bills?search=${encodeURIComponent(b.vendor.name)}` });

    // 2. bill vs purchase order, over-billing
    const billedOnPo = new Map<string, Prisma.Decimal>();
    for (const b of bills) if (b.purchaseOrderId) billedOnPo.set(b.purchaseOrderId, (billedOnPo.get(b.purchaseOrderId) ?? D(0)).plus(b.total));
    for (const b of bills) {
      const po = b.purchaseOrderId ? pos.find((p) => p.id === b.purchaseOrderId) : null;
      if (!po) continue;
      const m = matchAgainstPo(b.total, { total: po.total, billed: D(billedOnPo.get(po.id)).minus(b.total) });
      if (m.matched === false) add({ type: 'BILL_PO_MISMATCH', severity: 'medium', weddingId: b.weddingId, wedding: b.wedding?.name ?? null, vendor: b.vendor.name, reference: `${b.billNo} vs ${po.poNumber}`, detail: `Bill differs from its purchase order by more than the 1% tolerance`, expected: D(po.total), actual: D(b.total), at: b.createdAt, link: `/vendor-bills?search=${encodeURIComponent(b.billNo)}` });
    }
    for (const po of pos) {
      const billed = D(billedOnPo.get(po.id));
      if (billed.gt(D(po.total).times(1.01).plus(1))) add({ type: 'PO_OVERBILLED', severity: 'high', weddingId: po.weddingId, wedding: po.wedding.name, vendor: po.vendor.name, reference: po.poNumber, detail: `Bills raised against ${po.poNumber} add up to more than the purchase order`, expected: D(po.total), actual: billed, at: po.createdAt, link: '/procurement?tab=orders' });
    }

    // 3. purchase order vs quotation (totals, quantities, rates)
    const qIds = [...new Set(pos.map((p) => p.quotationId).filter(Boolean) as string[])];
    const quotes = qIds.length ? await this.prisma.quotation.findMany({ where: { id: { in: qIds } }, include: { items: true } }) : [];
    for (const po of pos) {
      const qt = quotes.find((x) => x.id === po.quotationId);
      if (!qt) continue;
      const tol = D(qt.grandTotal).times(0.01).lt(1) ? D(1) : D(qt.grandTotal).times(0.01);
      if (D(po.total).minus(qt.grandTotal).abs().gt(tol)) add({ type: 'PO_QUOTATION_MISMATCH', severity: 'medium', weddingId: po.weddingId, wedding: po.wedding.name, vendor: po.vendor.name, reference: po.poNumber, detail: `Purchase order total differs from the accepted quotation`, expected: D(qt.grandTotal), actual: D(po.total), at: po.createdAt, link: '/procurement?tab=orders' });
      for (const l of po.lines) {
        const it = qt.items.find((x) => norm(x.name) === norm(l.description));
        if (!it) continue;
        if (!D(l.quantity).eq(it.quantity)) add({ type: 'QTY_DIFF', severity: 'medium', weddingId: po.weddingId, wedding: po.wedding.name, vendor: po.vendor.name, reference: `${po.poNumber} · ${l.description}`, detail: `Quantity on the PO differs from the quotation line`, expected: D(it.quantity), actual: D(l.quantity), at: po.createdAt, link: '/procurement?tab=orders' });
        if (!D(l.unitPrice).eq(it.unitPrice)) add({ type: 'RATE_DIFF', severity: 'medium', weddingId: po.weddingId, wedding: po.wedding.name, vendor: po.vendor.name, reference: `${po.poNumber} · ${l.description}`, detail: `Rate on the PO differs from the quotation line`, expected: D(it.unitPrice), actual: D(l.unitPrice), at: po.createdAt, link: '/procurement?tab=orders' });
      }
    }

    // 4. extras not approved
    for (const c of charges) {
      if (c.approved) continue;
      const wid = c.reconciliation.weddingId;
      add({ type: 'UNAPPROVED_EXTRA', severity: c.auto ? 'low' : 'medium', weddingId: wid, wedding: c.reconciliation.wedding.name, vendor: null, reference: c.description.slice(0, 80), detail: `${c.type.replace(/_/g, ' ').toLowerCase()} charge is awaiting approval and is not in any total`, expected: null, actual: D(c.amount), at: c.createdAt, link: `/expenses?tab=reconciliation&weddingId=${wid}` });
    }

    // 5. overpayments (vendor, bill, client milestone, invoice)
    const approvedExtra = new Map<string, Prisma.Decimal>();
    for (const c of charges) if (c.approved && c.weddingVendorId) approvedExtra.set(c.weddingVendorId, (approvedExtra.get(c.weddingVendorId) ?? D(0)).plus(c.amount));
    for (const v of wvs) {
      const s = vendorSettlement({ original: v.contractAmount, negotiated: v.negotiatedAmount ?? v.contractAmount, actualInvoice: v.settlement?.actualInvoice, approvedExtras: approvedExtra.get(v.id) ?? 0, paid: vendorPaid(v.payments), advance: vendorPaid(v.payments.filter((p) => p.kind === 'ADVANCE')) });
      if (s.overpaid.gt(0)) add({ type: 'VENDOR_OVERPAYMENT', severity: 'high', weddingId: v.weddingId, wedding: v.wedding.name, vendor: v.vendor.name, reference: v.vendor.name, detail: `Paid more than the vendor's final bill`, expected: s.finalBill, actual: s.paid, at: v.createdAt, link: `/vendor-payments?weddingId=${v.weddingId}` });
      const billIds = new Set(bills.filter((b) => b.weddingId === v.weddingId && b.vendorId === v.vendorId).map((b) => b.id));
      const loose = v.payments.filter((p) => p.status === 'PAID' && !p.billId && !p.reversalOfId);
      if (billIds.size && loose.length) add({ type: 'ADVANCE_UNMATCHED', severity: 'low', weddingId: v.weddingId, wedding: v.wedding.name, vendor: v.vendor.name, reference: v.vendor.name, detail: `${loose.length} payment(s) were made against the contract, not a bill; adjust them against ${billIds.size} bill(s)`, expected: null, actual: sum(loose.map((p) => p.amount)), at: v.createdAt, link: `/vendor-bills?weddingId=${v.weddingId}` });
    }
    for (const b of bills) if (D(b.amountPaid).gt(b.total)) add({ type: 'BILL_OVERPAID', severity: 'high', weddingId: b.weddingId, wedding: b.wedding?.name ?? null, vendor: b.vendor.name, reference: b.billNo, detail: `Bill has been paid more than its total`, expected: D(b.total), actual: D(b.amountPaid), at: b.createdAt, link: `/vendor-bills?search=${encodeURIComponent(b.billNo)}` });
    for (const m of ms) {
      const rec = clientReceived(m.payments);
      if (rec.gt(m.expectedAmount)) add({ type: 'CLIENT_OVERPAYMENT', severity: 'high', weddingId: m.weddingId, wedding: m.wedding.name, vendor: null, reference: m.type, detail: `More was received than this milestone expects`, expected: D(m.expectedAmount), actual: rec, at: m.dueDate, link: `/payments?weddingId=${m.weddingId}` });
    }
    for (const i of invs) if (D(i.amountPaid).gt(i.total)) add({ type: 'INVOICE_OVERPAID', severity: 'high', weddingId: i.weddingId, wedding: i.wedding.name, vendor: null, reference: i.invoiceNo, detail: `Invoice has been paid more than its total`, expected: D(i.total), actual: D(i.amountPaid), at: i.issueDate, link: `/invoices?search=${i.invoiceNo}` });

    // 6. unmatched / stuck transactions
    for (const p of cpays) {
      const age = now - p.createdAt.getTime();
      if (p.status === 'SUCCEEDED' && age > 2 * day) add({ type: 'CLIENT_PAYMENT_UNVERIFIED', severity: 'medium', weddingId: p.weddingId, wedding: p.wedding.name, vendor: null, reference: p.receiptNo, detail: `${p.milestone.type.toLowerCase()} payment recorded ${Math.floor(age / day)} days ago and still not verified`, expected: null, actual: D(p.amount), at: p.createdAt, link: `/payments?verified=false` });
      else if ((p.status === 'PENDING' || p.status === 'PROCESSING') && age > day) add({ type: 'GATEWAY_UNSETTLED', severity: 'medium', weddingId: p.weddingId, wedding: p.wedding.name, vendor: null, reference: p.gatewayRef ?? p.receiptNo, detail: `Gateway payment has been ${p.status.toLowerCase()} for over a day with no final callback`, expected: null, actual: D(p.amount), at: p.createdAt, link: `/payments?status=${p.status}` });
      else if (p.status === 'FAILED') add({ type: 'GATEWAY_FAILED', severity: 'low', weddingId: p.weddingId, wedding: p.wedding.name, vendor: null, reference: p.gatewayRef ?? p.receiptNo, detail: `Gateway reported a failed payment`, expected: null, actual: D(p.amount), at: p.createdAt, link: `/payments?status=FAILED` });
    }
    for (const p of vpays) add({ type: 'VENDOR_PAYMENT_FAILED', severity: 'medium', weddingId: p.weddingId, wedding: p.wedding.name, vendor: p.weddingVendor.vendor.name, reference: p.reference ?? p.id.slice(0, 8), detail: `Vendor payment failed: ${p.failureReason ?? 'no reason recorded'}`, expected: null, actual: D(p.amount), at: p.createdAt, link: `/vendor-payments?tab=failed` });

    const filtered = items.filter((i) => (!q.type || i.type === q.type) && (!q.severity || i.severity === q.severity)).sort((a, b) => SEV[a.severity] - SEV[b.severity] || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.type] = (counts[i.type] ?? 0) + 1;
    return { items: filtered, counts, total: items.length, bySeverity: { high: items.filter((i) => i.severity === 'high').length, medium: items.filter((i) => i.severity === 'medium').length, low: items.filter((i) => i.severity === 'low').length } };
  }
}
