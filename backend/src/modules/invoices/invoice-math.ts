import { ClientInvoiceStatus, Prisma } from '@prisma/client';
import { D, Dec, money, sum } from '../../common/finance';

export interface InvoiceLineInput { description: string; quantity: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value; taxRate?: Prisma.Decimal.Value }

/** Invoice totals. total = subtotal + tax - discount; every figure is rounded half-up to paise. Throws on a negative total. */
export function computeInvoice(lines: InvoiceLineInput[], discount: Prisma.Decimal.Value = 0) {
  const priced = lines.map((l) => {
    const total = money(D(l.quantity).times(D(l.unitPrice)));
    const tax = money(total.times(D(l.taxRate)).div(100));
    return { description: l.description, quantity: D(l.quantity), unitPrice: D(l.unitPrice), taxRate: D(l.taxRate), total, tax };
  });
  const subtotal = sum(priced.map((p) => p.total)), taxTotal = sum(priced.map((p) => p.tax));
  const disc = money(D(discount));
  const total = money(subtotal.plus(taxTotal).minus(disc));
  if (total.lt(0)) throw new RangeError('Discount cannot exceed the invoice amount');
  return { lines: priced, subtotal: money(subtotal), taxTotal: money(taxTotal), discount: disc, total };
}

/** Live status. Drafts and voids never change; everything else derives from payments and the due date (end of the due day). */
export function invoiceStatus(i: { status: ClientInvoiceStatus; total: Prisma.Decimal.Value; amountPaid: Prisma.Decimal.Value; dueDate?: Date | null }, now = new Date()): ClientInvoiceStatus {
  if (i.status === 'CANCELLED' || i.status === 'DRAFT') return i.status;
  const total = D(i.total), paid = D(i.amountPaid);
  if (total.gt(0) && paid.gte(total)) return 'PAID';
  if (i.dueDate && now.getTime() > i.dueDate.getTime() + 24 * 3600 * 1000 - 1) return 'OVERDUE';
  if (paid.gt(0)) return 'PARTIALLY_PAID';
  return 'SENT';
}

export const outstanding = (total: Prisma.Decimal.Value, paid: Prisma.Decimal.Value): Dec => { const o = D(total).minus(D(paid)); return money(o.lt(0) ? D(0) : o); };

/** Next sequential number `PREFIX-YYYY-0001` given the highest existing one for that year (or null). */
export function nextNumber(prefix: string, last: string | null, year = new Date().getFullYear()): string {
  const m = last ? /-(\d+)$/.exec(last) : null;
  return `${prefix}-${year}-${String((m ? parseInt(m[1], 10) : 0) + 1).padStart(4, '0')}`;
}
