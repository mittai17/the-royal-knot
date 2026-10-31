import { Prisma, VendorBillStatus } from '@prisma/client';
import { D, money } from '../../common/finance';

/** Live bill status: unpaid bills past their due date read as OVERDUE; PAID / REJECTED are final. */
export function billStatus(b: { status: VendorBillStatus; total: Prisma.Decimal.Value; amountPaid: Prisma.Decimal.Value; dueDate?: Date | null }, now = new Date()): VendorBillStatus {
  if (b.status === 'PAID' || b.status === 'REJECTED') return b.status;
  if (D(b.amountPaid).gte(D(b.total)) && D(b.total).gt(0)) return 'PAID';
  if (b.dueDate && now.getTime() > b.dueDate.getTime() + 24 * 3600 * 1000 - 1) return 'OVERDUE';
  return b.status === 'OVERDUE' ? 'SUBMITTED' : b.status;
}

export const billOutstanding = (total: Prisma.Decimal.Value, paid: Prisma.Decimal.Value) => { const o = D(total).minus(D(paid)); return money(o.lt(0) ? D(0) : o); };

/** Three-way style match of a bill against its purchase order. Tolerance is 1% of the PO or ₹1, whichever is greater. */
export function matchAgainstPo(billTotal: Prisma.Decimal.Value, po?: { total: Prisma.Decimal.Value; billed: Prisma.Decimal.Value } | null) {
  if (!po) return { matched: null as boolean | null, poTotal: null, variance: null, remaining: null };
  const poTotal = D(po.total);
  const variance = money(D(billTotal).minus(poTotal));
  const tol = poTotal.times(0.01).lt(1) ? D(1) : poTotal.times(0.01);
  const remaining = money(poTotal.minus(D(po.billed)));
  return { matched: variance.abs().lte(tol), poTotal: money(poTotal), variance, remaining };
}
