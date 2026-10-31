import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { D, money, sum } from '../../common/finance';
import { G } from '../../common/permissions';
import { ScopeService } from '../../common/scope.service';
import { StorageService } from '../../common/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { DocumentsService, MAX_UPLOAD } from '../documents/documents.service';
import { billOutstanding, billStatus } from './bill-math';
import { SubmitVendorInvoiceDto } from './vendor-bills.dto';
import { VendorBillsService } from './vendor-bills.service';

/** Vendor portal: a vendor's own invoices, payment history and settlement. Everything is scoped to User.vendorId. */
@ApiTags('portal-vendor') @ApiCookieAuth() @Controller('portal/vendor/invoices') @Roles(G.VENDOR_PORTAL)
export class VendorInvoicesController {
  constructor(private bills: VendorBillsService, private prisma: PrismaService, private scope: ScopeService, private docs: DocumentsService, private storage: StorageService) {}

  /** Own invoices + headline numbers + the weddings / purchase orders they can bill against. */
  @Get() async list(@CurrentUser() u: AuthUser) {
    const vendorId = this.scope.requireVendorId(u);
    const [rows, pos, weddings] = await Promise.all([
      this.prisma.vendorBill.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, include: { wedding: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, poNumber: true } } } }),
      this.prisma.purchaseOrder.findMany({ where: { vendorId, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, select: { id: true, poNumber: true, total: true, weddingId: true, wedding: { select: { name: true } } } }),
      this.prisma.wedding.findMany({ where: this.scope.weddingWhere(u), select: { id: true, name: true }, orderBy: { startDate: 'desc' } }),
    ]);
    const now = new Date();
    const items = rows.map((b) => ({ ...b, status: billStatus(b, now), outstanding: billOutstanding(b.total, b.amountPaid), hasFile: !!b.documentId }));
    const open = items.filter((i) => !['PAID', 'REJECTED'].includes(i.status));
    return {
      items, purchaseOrders: pos, weddings,
      summary: { submitted: items.length, pending: items.filter((i) => ['SUBMITTED', 'VERIFIED'].includes(i.status)).length, approved: items.filter((i) => i.status === 'APPROVED').length, overdue: items.filter((i) => i.status === 'OVERDUE').length, outstanding: money(sum(open.map((i) => i.outstanding))), paid: money(sum(items.map((i) => i.amountPaid))) },
    };
  }

  @Post() @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD } }))
  async submit(@Body() dto: SubmitVendorInvoiceDto, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser) {
    const vendorId = this.scope.requireVendorId(u);
    if (dto.weddingId) await this.scope.assertWeddingAccess(u, dto.weddingId);
    let documentId: string | null = null;
    if (file) {
      const doc = await this.docs.save({ weddingId: dto.weddingId ?? null, name: file.originalname, category: 'INVOICE', buffer: file.buffer, mime: file.mimetype, uploadedById: u.id, allowedRoles: ['FINANCE', 'VENDOR'] });
      documentId = doc.id;
    }
    return this.bills.shape(await this.bills.createBill({ ...dto, vendorId, documentId }, u, 'vendor'));
  }

  /** Every payment received: vendor payments recorded against bookings plus payments on submitted invoices. */
  @Get('payments') async payments(@CurrentUser() u: AuthUser) {
    const vendorId = this.scope.requireVendorId(u);
    const rows = await this.prisma.vendorPayment.findMany({ where: { weddingVendor: { vendorId } }, orderBy: { paidAt: 'desc' }, include: { weddingVendor: { select: { category: true, wedding: { select: { id: true, name: true } } } } } });
    const items = rows.map((p) => ({ id: p.id, kind: p.kind, amount: p.amount, method: p.method, reference: p.reference, paidAt: p.paidAt, wedding: p.weddingVendor.wedding, category: p.weddingVendor.category }));
    return { items, total: money(sum(items.map((i) => i.amount))) };
  }

  /** Per-booking settlement position: contract, paid, remaining and settlement status. */
  @Get('settlement') async settlement(@CurrentUser() u: AuthUser) {
    const vendorId = this.scope.requireVendorId(u);
    const wvs = await this.prisma.weddingVendor.findMany({ where: { vendorId }, include: { wedding: { select: { id: true, name: true, startDate: true } }, settlement: true, payments: { select: { amount: true } } }, orderBy: { createdAt: 'desc' } });
    const items = wvs.map((w) => {
      const contract = D(w.negotiatedAmount ?? w.contractAmount), billed = w.settlement?.actualInvoice != null ? D(w.settlement.actualInvoice) : contract, paid = sum(w.payments.map((p) => p.amount));
      const remaining = billed.minus(paid);
      return { weddingVendorId: w.id, wedding: w.wedding, category: w.category, contract: money(contract), billed: money(billed), paid: money(paid), remaining: money(remaining.lt(0) ? D(0) : remaining), status: w.settlement?.status ?? 'PENDING' };
    });
    return { items, totals: { billed: money(sum(items.map((i) => i.billed))), paid: money(sum(items.map((i) => i.paid))), remaining: money(sum(items.map((i) => i.remaining))) } };
  }

  @Get(':id') async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    const vendorId = this.scope.requireVendorId(u);
    const b = await this.prisma.vendorBill.findFirst({ where: { id, vendorId }, include: { vendor: { select: { id: true, name: true, category: true, gstin: true, bankDetails: true } }, wedding: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, poNumber: true, total: true, status: true, quotationId: true } } } });
    if (!b) throw new NotFoundException('Invoice not found');
    const d = await this.bills.detail(b);
    return { ...d, approval: null, requiresApproval: undefined, approvalLimit: undefined };
  }

  @Get(':id/file') async file(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    const vendorId = this.scope.requireVendorId(u);
    const b = await this.prisma.vendorBill.findFirst({ where: { id, vendorId }, select: { documentId: true } });
    if (!b) throw new NotFoundException('Invoice not found');
    if (!b.documentId) throw new BadRequestException('No file was uploaded with this invoice');
    const doc = await this.prisma.document.findUnique({ where: { id: b.documentId } });
    if (!doc) throw new NotFoundException('File not found');
    return new StreamableFile(await this.storage.get(doc.objectKey), { type: doc.mimeType, disposition: `attachment; filename="${encodeURIComponent(doc.name)}"` });
  }
}
