import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvitationStatus, Prisma, RSVP } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { ScopeService } from '../../common/scope.service';
import { assertTransition, RSVP_TRANSITIONS } from '../../common/state-machines';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { CheckInDto, CreateGuestDto, GuestQuery, UpdateGuestDto } from './guests.dto';

/** Minimal RFC-4180 style parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const truthy = (v?: string) => /^(y|yes|true|1|needed)$/i.test((v ?? '').trim());

@Injectable()
export class GuestsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private rt: RealtimeService, private scope: ScopeService) {}

  async list(weddingId: string, q: GuestQuery, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    const where: Prisma.GuestWhereInput = {
      weddingId, ...(q.rsvp ? { rsvp: q.rsvp } : {}), ...(q.invitationStatus ? { invitationStatus: q.invitationStatus } : {}), ...(q.groupName ? { groupName: q.groupName } : {}), ...(q.category ? { category: q.category } : {}),
      ...(q.checkedIn !== undefined ? { checkedIn: q.checkedIn } : {}), ...(q.accommodation !== undefined ? { accommodationNeeded: q.accommodation } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }, { email: { contains: q.search, mode: 'insensitive' } }, { groupName: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.guest.findMany({ where, orderBy: orderBy({ ...q, order: q.order ?? 'asc' } as GuestQuery, ['name', 'groupName', 'rsvp', 'category', 'createdAt', 'checkedInAt'], 'name'), ...skipTake(q) }),
      this.prisma.guest.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  /** Expected = invitation head-count (guests + plus-ones); Confirmed = RSVP yes (+ plus-ones); Actual = checked-in heads. */
  async stats(weddingId: string, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    const w = await this.prisma.wedding.findUnique({ where: { id: weddingId }, select: { expectedGuests: true, actualGuests: true } });
    if (!w) throw new NotFoundException('Wedding not found');
    const [rsvp, groups, dietary, totals, accom] = await Promise.all([
      this.prisma.guest.groupBy({ by: ['rsvp'], where: { weddingId }, _count: true, _sum: { plusOnes: true } }),
      this.prisma.guest.groupBy({ by: ['groupName'], where: { weddingId }, _count: true }),
      this.prisma.guest.groupBy({ by: ['dietary'], where: { weddingId, dietary: { not: null } }, _count: true }),
      this.prisma.guest.aggregate({ where: { weddingId }, _count: true, _sum: { plusOnes: true, checkedInCount: true } }),
      this.prisma.guest.count({ where: { weddingId, accommodationNeeded: true } }),
    ]);
    const heads = (r: RSVP) => { const x = rsvp.find((g) => g.rsvp === r); return (x?._count ?? 0) + (x?._sum.plusOnes ?? 0); };
    const invited = totals._count + (totals._sum.plusOnes ?? 0);
    return {
      weddingExpected: w.expectedGuests, invitedHeadcount: invited, guests: totals._count,
      confirmed: heads('CONFIRMED'), declined: heads('DECLINED'), pending: heads('PENDING'),
      checkedIn: totals._sum.checkedInCount ?? 0, actualRecorded: w.actualGuests, accommodationNeeded: accom,
      rsvp: Object.fromEntries(rsvp.map((r) => [r.rsvp, r._count])), groups: groups.map((g) => ({ group: g.groupName ?? 'Ungrouped', count: g._count })).sort((a, b) => b.count - a.count), dietary: dietary.map((d) => ({ dietary: d.dietary, count: d._count })),
    };
  }

  async create(weddingId: string, dto: CreateGuestDto, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    if (!(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
    const g = await this.prisma.guest.create({ data: { ...dto, weddingId } });
    await this.broadcast(weddingId);
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'Guest', entityId: g.id, action: 'create', message: `Registered guest ${g.name}` });
    return g;
  }

  /** Loads a guest and 403s unless the actor may access its wedding (IDOR guard for every /guests/:id route). */
  private async own(id: string, actor: AuthUser) {
    const g = await this.prisma.guest.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Guest not found');
    await this.scope.assertWeddingAccess(actor, g.weddingId);
    return g;
  }

  async update(id: string, dto: UpdateGuestDto, actor: AuthUser) {
    const cur = await this.own(id, actor);
    if (dto.rsvp) assertTransition('RSVP', RSVP_TRANSITIONS, cur.rsvp, dto.rsvp, { allowSame: true });
    const g = await this.prisma.guest.update({ where: { id }, data: dto }).catch(() => { throw new NotFoundException('Guest not found'); });
    await this.broadcast(g.weddingId);
    await this.audit.log({ actorId: actor.id, weddingId: g.weddingId, entity: 'Guest', entityId: id, action: 'update', message: `Updated guest ${g.name}${dto.rsvp ? ` (RSVP ${dto.rsvp})` : ''}` });
    return g;
  }

  async remove(id: string, actor: AuthUser) {
    await this.own(id, actor);
    const g = await this.prisma.guest.delete({ where: { id } }).catch(() => { throw new NotFoundException('Guest not found'); });
    await this.broadcast(g.weddingId);
    await this.audit.log({ actorId: actor.id, weddingId: g.weddingId, entity: 'Guest', entityId: id, action: 'delete', message: `Removed guest ${g.name}` });
    return { ok: true };
  }

  async checkIn(id: string, dto: CheckInDto, actor: AuthUser) {
    const prev = await this.own(id, actor);
    const count = dto.undo ? 0 : dto.count ?? 1 + prev.plusOnes;
    const g = await this.prisma.guest.update({ where: { id }, data: dto.undo ? { checkedIn: false, checkedInAt: null, checkedInCount: 0 } : { checkedIn: true, checkedInAt: new Date(), checkedInCount: count } });
    await this.audit.log({ actorId: actor.id, weddingId: g.weddingId, entity: 'Guest', entityId: id, action: dto.undo ? 'checkin.undo' : 'checkin', message: `${dto.undo ? 'Undid check-in for' : 'Checked in'} ${g.name}${dto.undo ? '' : ` (${count})`}` });
    await this.broadcast(g.weddingId);
    return g;
  }

  /** CSV columns (header row required): name, phone, email, group, category, plusOnes, dietary, accommodation, rsvp, invitation. Existing name+phone pairs are skipped. */
  async importCsv(weddingId: string, csv: string, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    const rows = parseCsv(csv.replace(/^﻿/, ''));
    if (rows.length < 2) throw new BadRequestException('CSV needs a header row and at least one guest');
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const col = (names: string[]) => header.findIndex((h) => names.includes(h));
    const idx = { name: col(['name', 'guestname', 'fullname']), phone: col(['phone', 'mobile', 'contact']), email: col(['email']), group: col(['group', 'family', 'familygroup', 'groupname']), category: col(['category', 'side']), plus: col(['plusones', 'accompanying', 'accompanyingguests', 'plusone']), diet: col(['dietary', 'diet', 'dietarypreference']), accom: col(['accommodation', 'accommodationneeded', 'stay']), rsvp: col(['rsvp']), inv: col(['invitation', 'invitationstatus']) };
    if (idx.name < 0) throw new BadRequestException('CSV must contain a "name" column');
    const existing = new Set((await this.prisma.guest.findMany({ where: { weddingId }, select: { name: true, phone: true } })).map((g) => `${g.name.toLowerCase()}|${g.phone ?? ''}`));
    const errors: { row: number; error: string }[] = [];
    const data: Prisma.GuestCreateManyInput[] = [];
    rows.slice(1).forEach((r, i) => {
      const get = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
      const name = get(idx.name);
      if (!name) return errors.push({ row: i + 2, error: 'Missing name' });
      const key = `${name.toLowerCase()}|${get(idx.phone)}`;
      if (existing.has(key)) return errors.push({ row: i + 2, error: 'Duplicate (name + phone) skipped' });
      existing.add(key);
      const rsvp = get(idx.rsvp).toUpperCase(); const inv = get(idx.inv).toUpperCase().replace(/ /g, '_');
      const plus = parseInt(get(idx.plus) || '0', 10);
      if (Number.isNaN(plus) || plus < 0) return errors.push({ row: i + 2, error: 'plusOnes must be a non-negative number' });
      data.push({ weddingId, name, phone: get(idx.phone) || null, email: get(idx.email) || null, groupName: get(idx.group) || null, category: get(idx.category) || null, plusOnes: plus, dietary: get(idx.diet) || null, accommodationNeeded: truthy(get(idx.accom)), rsvp: ((({ YES: 'CONFIRMED', NO: 'DECLINED', MAYBE: 'PENDING' }) as Record<string, string>)[rsvp] ?? (['CONFIRMED', 'DECLINED', 'PENDING'].includes(rsvp) ? rsvp : 'PENDING')) as RSVP, invitationStatus: (['NOT_SENT', 'SENT', 'DELIVERED'].includes(inv) ? inv : 'NOT_SENT') as InvitationStatus });
    });
    for (let i = 0; i < data.length; i += 500) await this.prisma.guest.createMany({ data: data.slice(i, i + 500) });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'Guest', action: 'import', message: `Imported ${data.length} guests from CSV (${errors.length} skipped)` });
    await this.broadcast(weddingId);
    return { imported: data.length, skipped: errors.length, errors: errors.slice(0, 50) };
  }

  private async broadcast(weddingId: string) { this.rt.toWedding(weddingId, 'guests.updated', await this.stats(weddingId)); }
}
