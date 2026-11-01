import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus, VendorCategory } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, money, sum } from '../../common/finance';
import { Paginated } from '../../common/pagination';
import { PdfService } from '../../common/pdf.service';
import { dt, inr, kv, page, table } from '../../common/pdf-templates';
import { ScopeService } from '../../common/scope.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QuotationsService } from '../quotations/quotations.service';
import { nextNumber } from '../invoices/invoice-math';
import { CreatePoDto, PoQuery, UpdatePoDto } from './procurement.dto';

const include = {
  wedding: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true, category: true, gstin: true } },
  lines: true,
  _count: { select: { bills: true } },
} satisfies Prisma.PurchaseOrderInclude;

const FLOW: Record<string, PurchaseOrderStatus[]> = { send: ['DRAFT'], accept: ['SENT'], fulfil: ['ACCEPTED'], cancel: ['DRAFT', 'SENT', 'ACCEPTED'] };
const TARGET: Record<string, PurchaseOrderStatus> = { send: 'SENT', accept: 'ACCEPTED', fulfil: 'FULFILLED', cancel: 'CANCELLED' };

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private quotations: QuotationsService, private scope: ScopeService, private pdf: PdfService) {}

  /** RFQ rounds (one row per sourcing request) with the PO already raised from the winning quote, if any. */
  async rfqs(q: { weddingId?: string; category?: VendorCategory }, u?: AuthUser) {
    const groups = await this.quotations.listGroups({ ...q, page: 1, pageSize: 500, order: 'desc' } as never, u);
    const accepted = await this.prisma.purchaseOrder.findMany({ where: { quotationId: { not: null }, status: { not: 'CANCELLED' } }, select: { id: true, poNumber: true, quotationId: true } });
    const poByQuote = new Map(accepted.map((p) => [p.quotationId!, p]));
    return groups.map((g) => {
      const winner = g.requests.find((r) => r.status === 'SELECTED');
      return { ...g, winnerQuotationId: winner?.quotationId ?? null, purchaseOrder: winner?.quotationId ? poByQuote.get(winner.quotationId) ?? null : null };
    });
  }

  comparison(weddingId: string, category?: VendorCategory, rfqGroup?: string, u?: AuthUser) { return this.quotations.comparison(weddingId, category, rfqGroup, u); }

  async list(q: PoQuery, u: AuthUser) {
    const where: Prisma.PurchaseOrderWhereInput = {
      ...this.scope.byVendorId(u), ...(q.status ? { status: q.status } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      ...(q.search ? { OR: [{ poNumber: { contains: q.search, mode: 'insensitive' } }, { vendor: { name: { contains: q.search, mode: 'insensitive' } } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
      // Vendors never see drafts.
      ...(this.scope.isVendor(u) ? { AND: [{ status: { not: 'DRAFT' as const } }] } : {}),
    };
    const [rows, total, agg] = await Promise.all([
      this.prisma.purchaseOrder.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.groupBy({ by: ['status'], where: this.scope.byVendorId(u), _count: true, _sum: { total: true } }),
    ]);
    const p = new Paginated(rows, { page: q.page, pageSize: q.pageSize, total });
    (p.meta as Record<string, unknown>).summary = { counts: Object.fromEntries(agg.map((a) => [a.status, a._count])), value: money(sum(agg.filter((a) => a.status !== 'CANCELLED').map((a) => a._sum.total))) };
    return p;
  }

  async get(id: string, u: AuthUser) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, ...this.scope.byVendorId(u), ...(this.scope.isVendor(u) ? { status: { not: 'DRAFT' } } : {}) }, include: { ...include, bills: { select: { id: true, billNo: true, status: true, total: true, amountPaid: true } } } });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  private priceLines(lines: { description: string; quantity: number | Prisma.Decimal; unit?: string; unitPrice: number | Prisma.Decimal; taxRate?: number | Prisma.Decimal }[]) {
    const priced = lines.map((l) => { const total = money(D(l.quantity).times(D(l.unitPrice))); return { description: l.description, quantity: D(l.quantity), unit: l.unit ?? 'unit', unitPrice: D(l.unitPrice), taxRate: D(l.taxRate), total, tax: money(total.times(D(l.taxRate)).div(100)) }; });
    return { priced, subtotal: money(sum(priced.map((p) => p.total))), taxTotal: money(sum(priced.map((p) => p.tax))) };
  }

  async create(dto: CreatePoDto, actor: AuthUser) {
    let weddingId = dto.weddingId, vendorId = dto.vendorId, quotationId: string | null = null;
    let lines: Parameters<ProcurementService['priceLines']>[0] = dto.lines ?? [];
    let extra = D(0);
    if (dto.quotationId) {
      const q = await this.prisma.quotation.findUnique({ where: { id: dto.quotationId }, include: { items: true, request: true } });
      if (!q) throw new NotFoundException('Quotation not found');
      if (q.status !== 'SELECTED') throw new UnprocessableEntityException('A purchase order can only be raised from the selected (accepted) quotation');
      if (await this.prisma.purchaseOrder.count({ where: { quotationId: q.id, status: { not: 'CANCELLED' } } })) throw new ConflictException('A purchase order already exists for this quotation');
      weddingId = q.request.weddingId; vendorId = q.request.vendorId; quotationId = q.id;
      lines = q.items.filter((i) => i.included).map((i) => ({ description: i.name + (i.description ? ` — ${i.description}` : ''), quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, taxRate: i.taxRate }));
      extra = D(q.additionalTotal);
      if (extra.gt(0)) lines.push({ description: 'Additional charges (per quotation)', quantity: 1, unit: 'lot', unitPrice: extra, taxRate: 0 });
    } else {
      if (!weddingId || !vendorId || !lines.length) throw new BadRequestException('Provide a quotationId, or a weddingId, vendorId and at least one line');
      if (!(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
      if (!(await this.prisma.vendor.count({ where: { id: vendorId } }))) throw new NotFoundException('Vendor not found');
    }
    const { priced, subtotal, taxTotal } = this.priceLines(lines);
    const po = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('PurchaseOrder.poNumber'))`;
      const year = new Date().getFullYear();
      const last = await tx.purchaseOrder.findFirst({ where: { poNumber: { startsWith: `PO-${year}-` } }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } });
      const created = await tx.purchaseOrder.create({
        data: { poNumber: nextNumber('PO', last?.poNumber ?? null, year), weddingId: weddingId!, vendorId: vendorId!, quotationId, subtotal, taxTotal, total: money(subtotal.plus(taxTotal)), terms: dto.terms, expectedBy: dto.expectedBy ? new Date(dto.expectedBy) : undefined, createdById: actor.id, lines: { create: priced.map(({ tax: _t, ...l }) => l) } },
        include,
      });
      await this.audit.log({ actorId: actor.id, weddingId, entity: 'PurchaseOrder', entityId: created.id, action: 'create', message: `Created purchase order ${created.poNumber} for ${created.vendor.name} (${inr(created.total)})${quotationId ? ' from selected quotation' : ''}`, meta: { quotationId } }, tx);
      return created;
    });
    return po;
  }

  async update(id: string, dto: UpdatePoDto, actor: AuthUser) {
    const cur = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Purchase order not found');
    if (cur.status !== 'DRAFT') throw new UnprocessableEntityException('Only draft purchase orders can be edited');
    const po = await this.prisma.purchaseOrder.update({ where: { id }, data: { terms: dto.terms, expectedBy: dto.expectedBy ? new Date(dto.expectedBy) : undefined }, include });
    await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'PurchaseOrder', entityId: id, action: 'update', message: `Edited draft ${cur.poNumber}` });
    return po;
  }

  async transition(id: string, action: 'send' | 'accept' | 'fulfil' | 'cancel', actor: AuthUser) {
    const cur = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { vendor: { select: { name: true } } } });
    if (!cur) throw new NotFoundException('Purchase order not found');
    if (actor.role === 'VENDOR') {
      this.scope.assertVendorAccess(actor, cur.vendorId);
      if (action !== 'accept') throw new ForbiddenException('Vendors can only accept purchase orders');
    }
    const claim = await this.prisma.purchaseOrder.updateMany({ where: { id, status: { in: FLOW[action] } }, data: { status: TARGET[action], ...(action === 'send' ? { issuedAt: new Date() } : {}) } });
    if (!claim.count) throw new UnprocessableEntityException(`A ${cur.status.toLowerCase()} purchase order cannot be ${action === 'send' ? 'sent' : action === 'fulfil' ? 'marked fulfilled' : `${action}ed`}`);
    await this.audit.log({ actorId: actor.id, weddingId: cur.weddingId, entity: 'PurchaseOrder', entityId: id, action, message: `${cur.poNumber} → ${TARGET[action].toLowerCase()} (${cur.vendor.name})` });
    if (action === 'send') await this.notif.notify({ type: 'po.sent', title: 'Purchase order issued', body: `${cur.poNumber} · ${cur.vendor.name} · ${inr(cur.total)}`, link: '/procurement', roles: ['PLANNER', 'FINANCE'] }).catch(() => undefined);
    return this.get(id, actor);
  }

  async renderPdf(id: string, u: AuthUser) {
    const po = await this.get(id, u);
    const html = page(`Purchase Order ${po.poNumber}`, `${po.wedding.name} · ${po.status}`,
      kv([['Vendor', po.vendor.name], ['GSTIN', po.vendor.gstin ?? '—'], ['Wedding', po.wedding.name], ['Issued', dt(po.issuedAt)], ['Expected by', dt(po.expectedBy)]])
      + table([{ label: 'Item' }, { label: 'Qty', num: true }, { label: 'Unit' }, { label: 'Unit price', num: true }, { label: 'Tax %', num: true }, { label: 'Total', num: true }], po.lines.map((l) => [l.description, String(l.quantity), l.unit, inr(l.unitPrice), String(l.taxRate), inr(l.total)]), ['Total', '', '', '', '', inr(po.subtotal)])
      + kv([['Subtotal', inr(po.subtotal)], ['Tax', inr(po.taxTotal)], ['Order total', inr(po.total)]]) + (po.terms ? `<h2>Terms</h2><p>${po.terms.replace(/[<>&]/g, '')}</p>` : ''));
    return new StreamableFile(await this.pdf.htmlToPdf(html), { type: 'application/pdf', disposition: `inline; filename="${po.poNumber}.pdf"` });
  }
}
