import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProposalStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgreementsService } from '../agreements/agreements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateProposalDto, ProposalQuery, UpdateProposalDto } from './proposals.dto';

type Row = Prisma.ProposalGetPayload<{ include: { wedding: { select: { id: true; name: true; couple: { select: { brideName: true; groomName: true } }; contractValue: true } } } }>;
const include = { wedding: { select: { id: true, name: true, contractValue: true, couple: { select: { brideName: true, groomName: true } } } } } satisfies Prisma.ProposalInclude;

/** Pure status rule used when syncing with the agreement: a signed agreement means the proposal was accepted. */
export function statusFromAgreement(current: ProposalStatus, agreementStatus?: string | null): ProposalStatus {
  if (agreementStatus === 'SIGNED' && (current === 'SENT' || current === 'VIEWED')) return 'ACCEPTED';
  return current;
}

@Injectable()
export class ProposalsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private agreements: AgreementsService, private notif: NotificationsService) {}

  /** Moves SENT proposals to ACCEPTED once the linked agreement is signed (the signature flow is the source of truth). */
  private async sync(rows: Row[]) {
    const ids = rows.filter((r) => r.agreementId && (r.status === 'SENT' || r.status === 'VIEWED')).map((r) => r.agreementId!);
    if (!ids.length) return rows;
    const ags = await this.prisma.agreement.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, signatures: { select: { signedAt: true }, orderBy: { signedAt: 'desc' }, take: 1 } } });
    for (const r of rows) {
      const ag = ags.find((a) => a.id === r.agreementId);
      const next = statusFromAgreement(r.status, ag?.status);
      if (next !== r.status) {
        const at = ag?.signatures[0]?.signedAt ?? new Date();
        await this.prisma.proposal.update({ where: { id: r.id }, data: { status: next, respondedAt: at } });
        r.status = next; r.respondedAt = at;
      }
    }
    return rows;
  }

  private async shape(rows: Row[]) {
    await this.sync(rows);
    const enqIds = rows.map((r) => r.enquiryId).filter((x): x is string => !!x);
    const enqs = await this.prisma.enquiry.findMany({ where: { id: { in: enqIds } }, select: { id: true, couple: { select: { brideName: true, groomName: true } } } });
    const ags = await this.prisma.agreement.findMany({ where: { id: { in: rows.map((r) => r.agreementId).filter((x): x is string => !!x) } }, select: { id: true, status: true, version: true } });
    return rows.map((r) => {
      const c = r.wedding?.couple ?? enqs.find((e) => e.id === r.enquiryId)?.couple;
      const ag = ags.find((a) => a.id === r.agreementId);
      return {
        id: r.id, title: r.title, status: r.status, packageName: r.packageName, amount: r.amount, content: r.content, validUntil: r.validUntil, sentAt: r.sentAt, respondedAt: r.respondedAt,
        weddingId: r.weddingId, wedding: r.wedding ? { id: r.wedding.id, name: r.wedding.name } : null, enquiryId: r.enquiryId, couple: c ? `${c.brideName} & ${c.groomName}` : null,
        agreement: ag ? { id: ag.id, status: ag.status, version: ag.version } : null,
        amountMismatch: !!r.wedding && !!r.agreementId && Number(r.wedding.contractValue) !== Number(r.amount),
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      };
    });
  }

  async list(q: ProposalQuery) {
    const where: Prisma.ProposalWhereInput = {
      ...(q.status ? { status: q.status } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.enquiryId ? { enquiryId: q.enquiryId } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { packageName: { contains: q.search, mode: 'insensitive' } }, { wedding: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([this.prisma.proposal.findMany({ where, orderBy: { createdAt: 'desc' }, include, ...skipTake(q) }), this.prisma.proposal.count({ where })]);
    return new Paginated(await this.shape(rows), { page: q.page, pageSize: q.pageSize, total });
  }

  async summary() {
    const g = await this.prisma.proposal.groupBy({ by: ['status'], _count: true, _sum: { amount: true } });
    const out: Record<string, { count: number; amount: number }> = {};
    for (const r of g) out[r.status] = { count: r._count, amount: Number(r._sum.amount ?? 0) };
    return out;
  }

  private async load(id: string) {
    const r = await this.prisma.proposal.findUnique({ where: { id }, include });
    if (!r) throw new NotFoundException('Proposal not found');
    return r;
  }

  async get(id: string) { return (await this.shape([await this.load(id)]))[0]; }

  async create(u: AuthUser, dto: CreateProposalDto) {
    if (!dto.weddingId && !dto.enquiryId) throw new BadRequestException('Link the proposal to a wedding or an enquiry');
    if (dto.weddingId && !(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    if (dto.enquiryId && !(await this.prisma.enquiry.count({ where: { id: dto.enquiryId } }))) throw new NotFoundException('Enquiry not found');
    const row = await this.prisma.proposal.create({
      data: { title: dto.title.trim(), weddingId: dto.weddingId ?? null, enquiryId: dto.enquiryId ?? null, packageName: dto.packageName, amount: dto.amount ?? 0, content: dto.content, validUntil: dto.validUntil ? new Date(dto.validUntil) : null, createdById: u.id },
      include,
    });
    await this.audit.log({ actorId: u.id, weddingId: row.weddingId, entity: 'Proposal', entityId: row.id, action: 'create', message: `Drafted proposal "${row.title}"` });
    return (await this.shape([row]))[0];
  }

  async update(u: AuthUser, id: string, dto: UpdateProposalDto) {
    const cur = await this.load(id);
    if (cur.status !== 'DRAFT') throw new ConflictException('Only draft proposals can be edited');
    if (dto.weddingId && !(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    const row = await this.prisma.proposal.update({
      where: { id },
      data: { ...(dto.title ? { title: dto.title.trim() } : {}), ...(dto.weddingId ? { weddingId: dto.weddingId } : {}), ...(dto.packageName !== undefined ? { packageName: dto.packageName } : {}), ...(dto.amount !== undefined ? { amount: dto.amount } : {}), ...(dto.content !== undefined ? { content: dto.content } : {}), ...(dto.validUntil ? { validUntil: new Date(dto.validUntil) } : {}) },
      include,
    });
    await this.audit.log({ actorId: u.id, weddingId: row.weddingId, entity: 'Proposal', entityId: id, action: 'update', message: `Edited proposal "${row.title}"` });
    return (await this.shape([row]))[0];
  }

  /** Sends the proposal. With a wedding, the existing agreement flow generates the agreement that the client signs. */
  async send(u: AuthUser, id: string, templateId?: string) {
    const cur = await this.load(id);
    if (cur.status !== 'DRAFT') throw new ConflictException('This proposal was already sent');
    let agreementId: string | null = null;
    if (cur.weddingId) agreementId = (await this.agreements.generate(cur.weddingId, templateId, u)).id;
    const row = await this.prisma.proposal.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), agreementId }, include });
    if (row.wedding) {
      const w = await this.prisma.wedding.findUnique({ where: { id: row.wedding.id }, select: { coupleId: true } });
      const clients = w ? await this.prisma.user.findMany({ where: { coupleId: w.coupleId, role: 'CLIENT', status: 'ACTIVE' }, select: { id: true } }) : [];
      if (clients.length) await this.notif.notify({ type: 'proposal', title: 'A proposal is ready for your signature', body: row.title, link: '/client-portal/documents', userIds: clients.map((c) => c.id) }).catch(() => undefined);
    }
    await this.audit.log({ actorId: u.id, weddingId: row.weddingId, entity: 'Proposal', entityId: id, action: 'send', message: agreementId ? `Sent "${row.title}" for signature (agreement generated)` : `Marked "${row.title}" as sent`, meta: { agreementId } });
    return (await this.shape([row]))[0];
  }

  /** Records the client's decision when it did not come through the signature flow. */
  async respond(u: AuthUser, id: string, status: 'ACCEPTED' | 'DECLINED') {
    const cur = await this.load(id);
    if (cur.status !== 'SENT' && cur.status !== 'VIEWED') throw new ConflictException('Only sent proposals can be accepted or declined');
    const row = await this.prisma.proposal.update({ where: { id }, data: { status, respondedAt: new Date() }, include });
    await this.audit.log({ actorId: u.id, weddingId: row.weddingId, entity: 'Proposal', entityId: id, action: status.toLowerCase(), message: `Proposal "${row.title}" ${status.toLowerCase()}` });
    return (await this.shape([row]))[0];
  }

  async remove(u: AuthUser, id: string) {
    const cur = await this.load(id);
    if (cur.status !== 'DRAFT') throw new ConflictException('Only draft proposals can be deleted');
    await this.prisma.proposal.delete({ where: { id } });
    await this.audit.log({ actorId: u.id, weddingId: cur.weddingId, entity: 'Proposal', entityId: id, action: 'delete', message: `Deleted draft "${cur.title}"` });
    return { ok: true };
  }

  /** Agreement templates double as proposal templates (their body seeds the proposal text) plus the configured packages. */
  async templates() {
    const [templates, master] = await Promise.all([this.prisma.agreementTemplate.findMany({ orderBy: { name: 'asc' } }), this.prisma.masterDataItem.findMany({ where: { type: 'PACKAGE', active: true }, orderBy: { sortOrder: 'asc' } })]);
    const packages = [
      { code: 'FULL_SERVICE', label: 'Full-Service Wedding', description: 'Design, venue, vendors, guest management and complete event-day coordination.' },
      { code: 'PARTIAL', label: 'Partial / Day-of Management', description: 'Schedule, vendor arrival coordination and event-day execution.' },
      ...master.filter((m) => !['FULL_SERVICE', 'PARTIAL'].includes(m.code)).map((m) => ({ code: m.code, label: m.label, description: '' })),
    ];
    return { templates, packages };
  }
}
