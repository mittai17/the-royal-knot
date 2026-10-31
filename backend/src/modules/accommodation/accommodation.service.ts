import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoomAllocationStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { ScopeService } from '../../common/scope.service';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { AccommodationStatsQuery, AllocateDto, AllocationQuery, BulkRoomsDto, CreateHotelDto, CreateRoomDto, RoomQuery, UpdateAllocationDto, UpdateHotelDto, UpdateRoomDto } from './accommodation.dto';

const ACTIVE: RoomAllocationStatus[] = ['RESERVED', 'CHECKED_IN'];
const include = {
  room: { select: { id: true, number: true, type: true, capacity: true, hotel: { select: { id: true, name: true, city: true } } } },
  guest: { select: { id: true, name: true, groupName: true, phone: true } },
  wedding: { select: { id: true, name: true } },
} satisfies Prisma.RoomAllocationInclude;

/** Two stays overlap when they share at least one night: a.in < b.out && b.in < a.out. */
export const overlaps = (a: { checkIn: Date; checkOut: Date }, b: { checkIn: Date; checkOut: Date }) => a.checkIn < b.checkOut && b.checkIn < a.checkOut;

@Injectable()
export class AccommodationService {
  constructor(private prisma: PrismaService, private audit: AuditService, private rt: RealtimeService, private scope: ScopeService) {}

  // ---------------------------------------------------------------- hotels & rooms
  async hotels(search?: string) {
    const hotels = await this.prisma.hotel.findMany({ where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { city: { contains: search, mode: 'insensitive' } }] } : {}, orderBy: { name: 'asc' }, include: { rooms: { select: { id: true, capacity: true, active: true } } } });
    const now = new Date();
    const live = await this.prisma.roomAllocation.groupBy({ by: ['roomId'], where: { status: { in: ACTIVE }, checkIn: { lte: now }, checkOut: { gt: now } }, _count: true });
    const occ = new Map(live.map((l) => [l.roomId, l._count]));
    return hotels.map(({ rooms, ...h }) => {
      const active = rooms.filter((r) => r.active);
      const capacity = active.reduce((s, r) => s + r.capacity, 0);
      const occupied = active.reduce((s, r) => s + Math.min(r.capacity, occ.get(r.id) ?? 0), 0);
      return { ...h, roomCount: active.length, capacity, occupied, occupancyPct: capacity ? Math.round((occupied / capacity) * 100) : 0 };
    });
  }
  async createHotel(dto: CreateHotelDto, actor: AuthUser) {
    const h = await this.prisma.hotel.create({ data: dto });
    await this.audit.log({ actorId: actor.id, entity: 'Hotel', entityId: h.id, action: 'create', message: `Added hotel ${h.name}` });
    return h;
  }
  async updateHotel(id: string, dto: UpdateHotelDto, actor: AuthUser) {
    const h = await this.prisma.hotel.update({ where: { id }, data: dto }).catch(() => { throw new NotFoundException('Hotel not found'); });
    await this.audit.log({ actorId: actor.id, entity: 'Hotel', entityId: id, action: 'update', message: `Updated hotel ${h.name}` });
    return h;
  }
  async deleteHotel(id: string, actor: AuthUser) {
    const h = await this.prisma.hotel.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('Hotel not found');
    const used = await this.prisma.roomAllocation.count({ where: { room: { hotelId: id } } });
    if (used) { await this.prisma.hotel.update({ where: { id }, data: { active: false } }); await this.audit.log({ actorId: actor.id, entity: 'Hotel', entityId: id, action: 'deactivate', message: `Deactivated hotel ${h.name} (has allocations)` }); return { ok: true, deactivated: true }; }
    await this.prisma.hotel.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, entity: 'Hotel', entityId: id, action: 'delete', message: `Removed hotel ${h.name}` });
    return { ok: true, deactivated: false };
  }

  /** Rooms of a hotel with the stays that overlap [from, to) (defaults to now onwards). */
  async rooms(hotelId: string, q: RoomQuery) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    const from = q.from ? new Date(q.from) : new Date(); const to = q.to ? new Date(q.to) : new Date(from.getTime() + 864e5);
    const rooms = await this.prisma.room.findMany({ where: { hotelId }, orderBy: { number: 'asc' }, include: { allocations: { where: { status: { in: ACTIVE }, checkIn: { lt: to }, checkOut: { gt: from } }, include: { guest: { select: { id: true, name: true } } } } } });
    return rooms.map(({ allocations, ...r }) => ({ ...r, rate: Number(r.rate), occupants: allocations.length, free: Math.max(0, r.capacity - allocations.length), allocations }));
  }
  async createRoom(hotelId: string, dto: CreateRoomDto, actor: AuthUser) {
    if (!(await this.prisma.hotel.count({ where: { id: hotelId } }))) throw new NotFoundException('Hotel not found');
    try {
      const r = await this.prisma.room.create({ data: { ...dto, hotelId } });
      await this.audit.log({ actorId: actor.id, entity: 'Room', entityId: r.id, action: 'create', message: `Added room ${r.number}` });
      return r;
    } catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException(`Room ${dto.number} already exists in this hotel`); throw e; }
  }
  async bulkRooms(hotelId: string, dto: BulkRoomsDto, actor: AuthUser) {
    if (dto.to < dto.from || dto.to - dto.from > 199) throw new BadRequestException('Provide a range of 1 to 200 rooms');
    if (!(await this.prisma.hotel.count({ where: { id: hotelId } }))) throw new NotFoundException('Hotel not found');
    const data = Array.from({ length: dto.to - dto.from + 1 }, (_, i) => ({ hotelId, number: `${dto.prefix ?? ''}${dto.from + i}`, type: dto.type ?? 'Standard', capacity: dto.capacity ?? 2, rate: dto.rate ?? 0 }));
    const r = await this.prisma.room.createMany({ data, skipDuplicates: true });
    await this.audit.log({ actorId: actor.id, entity: 'Room', action: 'bulk_create', message: `Added ${r.count} rooms` });
    return { created: r.count, skipped: data.length - r.count };
  }
  async updateRoom(id: string, dto: UpdateRoomDto, actor: AuthUser) {
    const r = await this.prisma.room.update({ where: { id }, data: dto }).catch((e) => { throw e?.code === 'P2002' ? new ConflictException('Room number already exists in this hotel') : new NotFoundException('Room not found'); });
    await this.audit.log({ actorId: actor.id, entity: 'Room', entityId: id, action: 'update', message: `Updated room ${r.number}` });
    return r;
  }
  async deleteRoom(id: string, actor: AuthUser) {
    const r = await this.prisma.room.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Room not found');
    if (await this.prisma.roomAllocation.count({ where: { roomId: id, status: { in: ACTIVE } } })) throw new ConflictException('Room has active allocations; cancel or check them out first');
    if (await this.prisma.roomAllocation.count({ where: { roomId: id } })) { await this.prisma.room.update({ where: { id }, data: { active: false } }); return { ok: true, deactivated: true }; }
    await this.prisma.room.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, entity: 'Room', entityId: id, action: 'delete', message: `Removed room ${r.number}` });
    return { ok: true, deactivated: false };
  }

  // ---------------------------------------------------------------- allocations
  private where(q: AllocationQuery): Prisma.RoomAllocationWhereInput {
    return {
      ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.hotelId ? { room: { hotelId: q.hotelId } } : {}),
      ...(q.search ? { OR: [{ guest: { name: { contains: q.search, mode: 'insensitive' } } }, { guest: { groupName: { contains: q.search, mode: 'insensitive' } } }, { room: { number: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
  }
  allocations(q: AllocationQuery) {
    return this.prisma.roomAllocation.findMany({ where: this.where(q), include, orderBy: [{ checkIn: 'asc' }, { createdAt: 'asc' }], take: 1000 });
  }

  async unallocatedGuests(weddingId: string) {
    const [guests, allocated] = await Promise.all([
      this.prisma.guest.findMany({ where: { weddingId, rsvp: { not: 'NO' } }, orderBy: [{ groupName: 'asc' }, { name: 'asc' }], select: { id: true, name: true, groupName: true, accommodationNeeded: true, plusOnes: true, rsvp: true } }),
      this.prisma.roomAllocation.findMany({ where: { weddingId, guestId: { not: null }, status: { in: ACTIVE } }, select: { guestId: true } }),
    ]);
    const done = new Set(allocated.map((a) => a.guestId));
    return guests.filter((g) => !done.has(g.id));
  }

  async allocate(dto: AllocateDto, actor: AuthUser) {
    const checkIn = new Date(dto.checkIn), checkOut = new Date(dto.checkOut);
    if (checkOut <= checkIn) throw new BadRequestException('Check-out must be after check-in');
    const guestIds = [...new Set(dto.guestIds ?? [])];
    const created = await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: dto.roomId }, include: { hotel: true } });
      if (!room || !room.active || !room.hotel.active) throw new NotFoundException('Room not available');
      if (!(await tx.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
      if (guestIds.length) {
        const found = await tx.guest.count({ where: { id: { in: guestIds }, weddingId: dto.weddingId } });
        if (found !== guestIds.length) throw new BadRequestException('Some guests do not belong to this wedding');
        const dup = await tx.roomAllocation.findMany({ where: { guestId: { in: guestIds }, status: { in: ACTIVE }, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } }, include: { guest: { select: { name: true } } } });
        if (dup.length) throw new ConflictException(`${dup.map((d) => d.guest?.name).join(', ')} already ha${dup.length > 1 ? 've' : 's'} a room for those dates`);
      }
      // lock the room row so concurrent allocations cannot exceed capacity
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${dto.roomId} FOR UPDATE`;
      const taken = await tx.roomAllocation.count({ where: { roomId: dto.roomId, status: { in: ACTIVE }, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } } });
      const need = Math.max(1, guestIds.length);
      if (taken + need > room.capacity) throw new ConflictException(`Room ${room.number} has ${Math.max(0, room.capacity - taken)} free bed(s) for those dates (needs ${need})`);
      const rows = guestIds.length ? guestIds : [null];
      const out = [];
      for (const gid of rows) out.push(await tx.roomAllocation.create({ data: { weddingId: dto.weddingId, roomId: dto.roomId, guestId: gid, checkIn, checkOut, notes: dto.notes }, include }));
      await this.audit.log({ actorId: actor.id, weddingId: dto.weddingId, entity: 'RoomAllocation', entityId: out[0].id, action: 'allocate', message: `Room ${room.number} (${room.hotel.name}) allocated to ${out.map((o) => o.guest?.name ?? 'block').join(', ')}` }, tx);
      return out;
    });
    this.rt.toWedding(dto.weddingId, 'accommodation.updated', { ids: created.map((c) => c.id) });
    return created;
  }

  private async load(id: string) {
    const a = await this.prisma.roomAllocation.findUnique({ where: { id }, include });
    if (!a) throw new NotFoundException('Allocation not found');
    return a;
  }
  async updateAllocation(id: string, dto: UpdateAllocationDto, actor: AuthUser) {
    const prev = await this.load(id);
    if (prev.status === 'CHECKED_OUT' || prev.status === 'CANCELLED') throw new BadRequestException(`A ${prev.status.toLowerCase().replace('_', '-')} allocation cannot be changed`);
    const checkIn = dto.checkIn ? new Date(dto.checkIn) : (await this.prisma.roomAllocation.findUniqueOrThrow({ where: { id } })).checkIn;
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : (await this.prisma.roomAllocation.findUniqueOrThrow({ where: { id } })).checkOut;
    if (checkOut <= checkIn) throw new BadRequestException('Check-out must be after check-in');
    const roomId = dto.roomId ?? prev.room.id;
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room || !room.active) throw new NotFoundException('Room not available');
    const taken = await this.prisma.roomAllocation.count({ where: { roomId, id: { not: id }, status: { in: ACTIVE }, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } } });
    if (taken + 1 > room.capacity) throw new ConflictException(`Room ${room.number} is full for those dates`);
    const a = await this.prisma.roomAllocation.update({ where: { id }, data: { roomId, checkIn, checkOut, ...(dto.notes !== undefined ? { notes: dto.notes } : {}) }, include });
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'RoomAllocation', entityId: id, action: 'update', message: `Updated stay of ${a.guest?.name ?? 'block'} (room ${a.room.number})` });
    this.rt.toWedding(a.weddingId, 'accommodation.updated', { ids: [id] });
    return a;
  }
  private async transition(id: string, to: RoomAllocationStatus, from: RoomAllocationStatus[], actor: AuthUser, verb: string) {
    const prev = await this.load(id);
    if (!from.includes(prev.status)) throw new BadRequestException(`Cannot ${verb} an allocation that is ${prev.status.toLowerCase().replace('_', ' ')}`);
    const now = new Date();
    const a = await this.prisma.roomAllocation.update({ where: { id }, data: { status: to, ...(to === 'CHECKED_IN' ? { checkedInAt: now } : {}), ...(to === 'CHECKED_OUT' ? { checkedOutAt: now } : {}) }, include });
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'RoomAllocation', entityId: id, action: verb.replace(' ', '_'), message: `${a.guest?.name ?? 'Block'} ${verb} room ${a.room.number} (${a.room.hotel.name})` });
    this.rt.toWedding(a.weddingId, 'accommodation.updated', { ids: [id] });
    return a;
  }
  checkIn(id: string, actor: AuthUser) { return this.transition(id, 'CHECKED_IN', ['RESERVED'], actor, 'check in'); }
  checkOut(id: string, actor: AuthUser) { return this.transition(id, 'CHECKED_OUT', ['CHECKED_IN'], actor, 'check out'); }
  cancel(id: string, actor: AuthUser) { return this.transition(id, 'CANCELLED', ['RESERVED', 'CHECKED_IN'], actor, 'cancel'); }
  async remove(id: string, actor: AuthUser) {
    const a = await this.load(id);
    if (a.status === 'CHECKED_IN') throw new BadRequestException('Check the guest out before removing the allocation');
    await this.prisma.roomAllocation.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'RoomAllocation', entityId: id, action: 'delete', message: `Removed allocation of ${a.guest?.name ?? 'block'} from room ${a.room.number}` });
    this.rt.toWedding(a.weddingId, 'accommodation.updated', { ids: [id], deleted: true });
    return { ok: true };
  }

  async stats(q: AccommodationStatsQuery) {
    const now = new Date();
    const roomWhere: Prisma.RoomWhereInput = { active: true, hotel: { active: true, ...(q.hotelId ? { id: q.hotelId } : {}) } };
    const [rooms, byStatus, tonight, needed, allocatedGuests] = await Promise.all([
      this.prisma.room.aggregate({ where: roomWhere, _count: true, _sum: { capacity: true } }),
      this.prisma.roomAllocation.groupBy({ by: ['status'], where: { ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.hotelId ? { room: { hotelId: q.hotelId } } : {}) }, _count: true }),
      this.prisma.roomAllocation.count({ where: { status: { in: ACTIVE }, checkIn: { lte: now }, checkOut: { gt: now }, room: roomWhere } }),
      q.weddingId ? this.prisma.guest.count({ where: { weddingId: q.weddingId, accommodationNeeded: true, rsvp: { not: 'NO' } } }) : this.prisma.guest.count({ where: { accommodationNeeded: true, rsvp: { not: 'NO' } } }),
      q.weddingId ? this.prisma.roomAllocation.count({ where: { weddingId: q.weddingId, guestId: { not: null }, status: { in: ACTIVE }, guest: { accommodationNeeded: true } } }) : this.prisma.roomAllocation.count({ where: { guestId: { not: null }, status: { in: ACTIVE }, guest: { accommodationNeeded: true } } }),
    ]);
    const n = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
    const capacity = rooms._sum.capacity ?? 0;
    return {
      rooms: rooms._count, capacity, reserved: n('RESERVED'), checkedIn: n('CHECKED_IN'), checkedOut: n('CHECKED_OUT'), cancelled: n('CANCELLED'),
      occupiedTonight: tonight, occupancyPct: capacity ? Math.round((Math.min(tonight, capacity) / capacity) * 100) : 0,
      guestsNeedingRooms: needed, guestsWithRooms: allocatedGuests, guestsWithoutRooms: Math.max(0, needed - allocatedGuests),
    };
  }

  // ---------------------------------------------------------------- client portal (read-only)
  async forClient(user: AuthUser) {
    const ids = await this.scope.requireClientWeddingIds(user);
    const rows = await this.prisma.roomAllocation.findMany({ where: { weddingId: { in: ids }, status: { not: 'CANCELLED' } }, orderBy: [{ checkIn: 'asc' }], include: { room: { select: { number: true, type: true, hotel: { select: { id: true, name: true, city: true, address: true, phone: true } } } }, guest: { select: { id: true, name: true, groupName: true } }, wedding: { select: { id: true, name: true } } } });
    const hotels = new Map<string, { id: string; name: string; city: string | null; address: string | null; phone: string | null; rooms: number; guests: number }>();
    for (const r of rows) { const h = r.room.hotel; const e = hotels.get(h.id) ?? { ...h, rooms: 0, guests: 0 }; e.guests += r.guestId ? 1 : 0; hotels.set(h.id, e); }
    const roomSet = new Set(rows.map((r) => r.roomId));
    for (const r of rows) { const e = hotels.get(r.room.hotel.id)!; e.rooms = new Set(rows.filter((x) => x.room.hotel.id === e.id).map((x) => x.roomId)).size; }
    const guestsNeeding = await this.prisma.guest.count({ where: { weddingId: { in: ids }, accommodationNeeded: true, rsvp: { not: 'NO' } } });
    return { summary: { allocations: rows.length, rooms: roomSet.size, guestsAssigned: rows.filter((r) => r.guestId).length, checkedIn: rows.filter((r) => r.status === 'CHECKED_IN').length, guestsNeedingRooms: guestsNeeding }, hotels: [...hotels.values()], allocations: rows };
  }
}
