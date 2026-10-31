import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClientQuery, CreateClientDto, UpdateClientDto } from './clients.dto';

const n = (v: unknown) => Number(v ?? 0);

/** Payment summary used by both the directory and the detail view. */
export function paymentSummary(contractValue: number, expected: number, received: number) {
  return { contractValue, expected, received, outstanding: Math.max(0, Math.max(contractValue, expected) - received) };
}

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(q: ClientQuery) {
    const where: Prisma.CoupleWhereInput = q.search
      ? { OR: [{ brideName: { contains: q.search, mode: 'insensitive' } }, { groomName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }, { weddings: { some: { name: { contains: q.search, mode: 'insensitive' } } } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.couple.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), include: { weddings: { select: { id: true, name: true, startDate: true, status: true, contractValue: true }, orderBy: { startDate: 'desc' } }, _count: { select: { enquiries: true, users: true } } } }),
      this.prisma.couple.count({ where }),
    ]);
    const wids = rows.flatMap((r) => r.weddings.map((w) => w.id));
    const paid = await this.prisma.clientPayment.groupBy({ by: ['weddingId'], where: { weddingId: { in: wids } }, _sum: { amount: true } });
    const exp = await this.prisma.paymentMilestone.groupBy({ by: ['weddingId'], where: { weddingId: { in: wids } }, _sum: { expectedAmount: true } });
    const last = await this.prisma.messageThread.groupBy({ by: ['weddingId'], where: { channel: 'CLIENT', weddingId: { in: wids } }, _max: { lastMessageAt: true } });
    const items = rows.map((r) => {
      const ids = r.weddings.map((w) => w.id);
      const contract = r.weddings.reduce((s, w) => s + n(w.contractValue), 0);
      const received = paid.filter((p) => ids.includes(p.weddingId)).reduce((s, p) => s + n(p._sum.amount), 0);
      const expected = exp.filter((p) => ids.includes(p.weddingId)).reduce((s, p) => s + n(p._sum.expectedAmount), 0);
      const lastAt = last.filter((l) => l.weddingId && ids.includes(l.weddingId)).map((l) => l._max.lastMessageAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const next = [...r.weddings].filter((w) => w.startDate >= new Date()).sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? r.weddings[0];
      return {
        id: r.id, brideName: r.brideName, groomName: r.groomName, name: `${r.brideName} & ${r.groomName}`, phone: r.phone, email: r.email, createdAt: r.createdAt,
        weddingsCount: r.weddings.length, enquiriesCount: r._count.enquiries, portalUsers: r._count.users, wedding: next ? { id: next.id, name: next.name, startDate: next.startDate, status: next.status } : null,
        payments: paymentSummary(contract, expected, received), lastContactAt: lastAt,
      };
    });
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  async get(u: AuthUser, id: string) {
    const c = await this.prisma.couple.findUnique({
      where: { id },
      include: {
        weddings: { orderBy: { startDate: 'desc' }, include: { planner: { select: { id: true, name: true } }, milestones: { orderBy: { dueDate: 'asc' }, include: { payments: { select: { amount: true } } } } } },
        enquiries: { orderBy: { createdAt: 'desc' }, select: { id: true, stage: true, source: true, preferredDate: true, createdAt: true, convertedWeddingId: true } },
        users: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } },
      },
    });
    if (!c) throw new NotFoundException('Client not found');
    const wids = c.weddings.map((w) => w.id);
    const payRows = await this.prisma.clientPayment.findMany({ where: { weddingId: { in: wids } }, orderBy: { paidAt: 'desc' }, take: 20, include: { milestone: { select: { type: true } }, wedding: { select: { name: true } } } });
    const weddings = c.weddings.map((w) => {
      const received = w.milestones.reduce((s, m) => s + m.payments.reduce((x, p) => x + n(p.amount), 0), 0);
      const expected = w.milestones.reduce((s, m) => s + n(m.expectedAmount), 0);
      const nextDue = w.milestones.find((m) => m.payments.reduce((x, p) => x + n(p.amount), 0) < n(m.expectedAmount));
      return {
        id: w.id, name: w.name, location: w.location, venue: w.venue, startDate: w.startDate, endDate: w.endDate, status: w.status, packageType: w.packageType, expectedGuests: w.expectedGuests, planner: w.planner,
        payments: paymentSummary(n(w.contractValue), expected, received), nextDue: nextDue ? { type: nextDue.type, dueDate: nextDue.dueDate, expectedAmount: nextDue.expectedAmount } : null,
      };
    });
    const total = weddings.reduce((a, w) => ({ contractValue: a.contractValue + w.payments.contractValue, expected: a.expected + w.payments.expected, received: a.received + w.payments.received, outstanding: a.outstanding + w.payments.outstanding }), { contractValue: 0, expected: 0, received: 0, outstanding: 0 });
    // Client chat transcripts are for the planning side only (finance sees payments, not conversations).
    const canSeeChat = u.role === Role.ADMIN || u.role === Role.PLANNER;
    let communications: unknown = null;
    if (canSeeChat) {
      const threads = await this.prisma.messageThread.findMany({ where: { channel: 'CLIENT', weddingId: { in: wids } }, select: { id: true, subject: true, weddingId: true, lastMessageAt: true, _count: { select: { messages: true } } }, orderBy: { lastMessageAt: 'desc' } });
      const msgs = await this.prisma.message.findMany({ where: { threadId: { in: threads.map((t) => t.id) } }, orderBy: { createdAt: 'desc' }, take: 15, include: { sender: { select: { name: true, role: true } } } });
      const acts = await this.prisma.enquiryActivity.findMany({ where: { enquiryId: { in: c.enquiries.map((e) => e.id) } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, type: true, message: true, createdAt: true } });
      communications = {
        threads: threads.map((t) => ({ id: t.id, subject: t.subject, weddingId: t.weddingId, lastMessageAt: t.lastMessageAt, messages: t._count.messages })),
        recentMessages: msgs.map((m) => ({ id: m.id, threadId: m.threadId, body: m.body, createdAt: m.createdAt, senderName: m.sender.name, senderRole: m.sender.role })),
        enquiryActivity: acts,
      };
    }
    return {
      id: c.id, brideName: c.brideName, groomName: c.groomName, name: `${c.brideName} & ${c.groomName}`, phone: c.phone, email: c.email, address: c.address, createdAt: c.createdAt,
      weddings, enquiries: c.enquiries, portalUsers: c.users, payments: total,
      recentPayments: payRows.map((p) => ({ id: p.id, receiptNo: p.receiptNo, amount: p.amount, method: p.method, paidAt: p.paidAt, milestone: p.milestone.type, wedding: p.wedding.name })),
      communications,
    };
  }

  async create(u: AuthUser, dto: CreateClientDto) {
    const c = await this.prisma.couple.create({ data: { brideName: dto.brideName.trim(), groomName: dto.groomName.trim(), phone: dto.phone, email: dto.email, address: dto.address } });
    await this.audit.log({ actorId: u.id, entity: 'Couple', entityId: c.id, action: 'create', message: `Added client ${c.brideName} & ${c.groomName}` });
    return c;
  }

  async update(u: AuthUser, id: string, dto: UpdateClientDto) {
    if (!(await this.prisma.couple.count({ where: { id } }))) throw new NotFoundException('Client not found');
    const c = await this.prisma.couple.update({ where: { id }, data: { ...dto } });
    await this.audit.log({ actorId: u.id, entity: 'Couple', entityId: id, action: 'update', message: `Updated client ${c.brideName} & ${c.groomName}`, meta: { fields: Object.keys(dto) } });
    return c;
  }
}
