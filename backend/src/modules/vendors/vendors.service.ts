import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { D, sum } from '../../common/finance';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { ScopeService } from '../../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { AssignVendorDto, CreateVendorDto, UpdateVendorDto, UpdateWeddingVendorDto, VendorQuery } from './vendors.dto';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private scope: ScopeService) {}

  async list(q: VendorQuery) {
    const where: Prisma.VendorWhereInput = {
      active: true, ...(q.category ? { category: q.category } : {}), ...(q.available !== undefined ? { available: q.available } : {}), ...(q.area ? { serviceAreas: { has: q.area } } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { businessName: { contains: q.search, mode: 'insensitive' } }, { contactName: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.vendor.findMany({ where, orderBy: orderBy({ ...q, order: q.order ?? 'asc' } as VendorQuery, ['name', 'rating', 'category', 'basePrice', 'createdAt'], 'name'), ...skipTake(q), include: { _count: { select: { weddingVendors: true } } } }),
      this.prisma.vendor.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  create(dto: CreateVendorDto, actor: AuthUser) {
    return this.prisma.vendor.create({ data: dto }).then(async (v) => { await this.audit.log({ actorId: actor.id, entity: 'Vendor', entityId: v.id, action: 'create', message: `Added vendor ${v.name}` }); return v; });
  }

  async get(id: string, user?: AuthUser) {
    // the directory is shared, but booking history / payments only for weddings the staff member is assigned to
    const v = await this.prisma.vendor.findUnique({ where: { id }, include: { services: true, weddingVendors: { ...(user && this.scope.isScoped(user) ? { where: { wedding: this.scope.weddingWhere(user) } } : {}), include: { wedding: { select: { id: true, name: true, startDate: true, status: true } }, arrival: true, settlement: true, payments: true }, orderBy: { createdAt: 'desc' } } } });
    if (!v) throw new NotFoundException('Vendor not found');
    return { ...v, performance: this.performance(v.weddingVendors) };
  }

  /** Timeliness from recorded arrivals; quoted vs actual from settlements. */
  private performance(wvs: { contractAmount: Prisma.Decimal; arrival: { status: string; delayMinutes: number } | null; settlement: { actualInvoice: Prisma.Decimal | null; negotiated: Prisma.Decimal } | null }[]) {
    const arrivals = wvs.filter((w) => w.arrival && w.arrival.status !== 'EXPECTED').map((w) => w.arrival!);
    const onTime = arrivals.filter((a) => a.delayMinutes <= 10).length;
    const settled = wvs.filter((w) => w.settlement?.actualInvoice);
    const quoted = sum(settled.map((w) => w.settlement!.negotiated)), actual = sum(settled.map((w) => w.settlement!.actualInvoice));
    return {
      assignments: wvs.length, arrivalsRecorded: arrivals.length, onTimeArrivals: onTime, timelinessPct: arrivals.length ? Math.round((onTime / arrivals.length) * 100) : null,
      avgDelayMinutes: arrivals.length ? Math.round(arrivals.reduce((a, x) => a + x.delayMinutes, 0) / arrivals.length) : 0,
      quoted, actual, costVariancePct: quoted.gt(0) ? actual.minus(quoted).div(quoted).times(100).toDecimalPlaces(1).toNumber() : null,
    };
  }

  async update(id: string, dto: UpdateVendorDto, actor: AuthUser) {
    const v = await this.prisma.vendor.update({ where: { id }, data: dto }).catch(() => { throw new NotFoundException('Vendor not found'); });
    await this.audit.log({ actorId: actor.id, entity: 'Vendor', entityId: id, action: 'update', message: `Updated vendor ${v.name}` });
    return v;
  }

  async weddingVendors(weddingId: string, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    const rows = await this.prisma.weddingVendor.findMany({ where: { weddingId }, include: { vendor: true, arrival: true, payments: true }, orderBy: { category: 'asc' } });
    return rows.map((r) => ({ ...r, paid: sum(r.payments.map((p) => p.amount)) }));
  }

  async assign(weddingId: string, dto: AssignVendorDto, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    if (!(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
    const wv = await this.prisma.weddingVendor.upsert({
      where: { weddingId_vendorId_category: { weddingId, vendorId: dto.vendorId, category: dto.category } },
      create: { weddingId, vendorId: dto.vendorId, category: dto.category, contractAmount: dto.contractAmount, negotiatedAmount: dto.contractAmount, notes: dto.notes },
      update: { contractAmount: dto.contractAmount, notes: dto.notes },
      include: { vendor: true },
    });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'WeddingVendor', entityId: wv.id, action: 'assign', message: `Assigned ${wv.vendor.name} (${dto.category})` });
    return wv;
  }

  async updateWeddingVendor(id: string, dto: UpdateWeddingVendorDto, actor: AuthUser) {
    const cur = await this.prisma.weddingVendor.findUnique({ where: { id }, select: { weddingId: true } });
    if (!cur) throw new NotFoundException('Assignment not found');
    await this.scope.assertWeddingAccess(actor, cur.weddingId);
    const wv = await this.prisma.weddingVendor.update({ where: { id }, data: dto }).catch(() => { throw new NotFoundException('Assignment not found'); });
    await this.audit.log({ actorId: actor.id, weddingId: wv.weddingId, entity: 'WeddingVendor', entityId: id, action: 'update', message: 'Updated vendor contract' });
    return wv;
  }

  async unassign(id: string, actor: AuthUser) {
    const cur = await this.prisma.weddingVendor.findUnique({ where: { id }, select: { weddingId: true } });
    if (!cur) throw new NotFoundException('Assignment not found');
    await this.scope.assertWeddingAccess(actor, cur.weddingId);
    const pay = await this.prisma.vendorPayment.count({ where: { weddingVendorId: id } });
    if (pay) throw new ConflictException('Vendor has recorded payments and cannot be removed');
    const wv = await this.prisma.weddingVendor.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, weddingId: wv.weddingId, entity: 'WeddingVendor', entityId: id, action: 'unassign', message: 'Removed vendor from wedding' });
    return { ok: true };
  }
}
