import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GuestTransportStatus, Prisma, TripStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { ScopeService } from '../../common/scope.service';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { CreateDriverDto, CreateGuestTransportDto, CreateTripDto, CreateVehicleDto, GuestTransportQuery, TransportStatsQuery, TripQuery, UpdateDriverDto, UpdateGuestTransportDto, UpdateTripDto, UpdateVehicleDto } from './transport.dto';

const BUSY: TripStatus[] = ['SCHEDULED', 'IN_PROGRESS'];
/** A vehicle / driver cannot take two trips closer than this. */
export const TRIP_GAP_MIN = 60;
const FLOW: Record<TripStatus, TripStatus[]> = { SCHEDULED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: ['SCHEDULED'] };
/** Plates are compared ignoring case, spaces and dashes (RJ14 CA 2210 == rj14-ca2210). */
export const normPlate = (p: string) => p.toUpperCase().replace(/[\s-]+/g, '');
export const tidyPlate = (p: string) => p.trim().toUpperCase().replace(/\s+/g, ' ');
export const canMoveTrip = (from: TripStatus, to: TripStatus) => FLOW[from].includes(to);

const tripInclude = {
  vehicle: { select: { id: true, plate: true, type: true, capacity: true } }, driver: { select: { id: true, name: true, phone: true } }, wedding: { select: { id: true, name: true } },
  passengers: { include: { guest: { select: { id: true, name: true, phone: true } } } },
} satisfies Prisma.TripInclude;
const gtInclude = {
  guest: { select: { id: true, name: true, phone: true, weddingId: true, groupName: true } },
  trip: { select: { id: true, title: true, scheduledAt: true, status: true, vehicle: { select: { plate: true, type: true } }, driver: { select: { name: true, phone: true } } } },
} satisfies Prisma.GuestTransportInclude;

@Injectable()
export class TransportService {
  constructor(private prisma: PrismaService, private audit: AuditService, private rt: RealtimeService, private scope: ScopeService) {}

  // ---------------------------------------------------------------- vehicles & drivers
  async vehicles() {
    const now = new Date();
    const v = await this.prisma.vehicle.findMany({ orderBy: { plate: 'asc' }, include: { trips: { where: { status: { in: BUSY }, scheduledAt: { gte: new Date(now.getTime() - 864e5) } }, select: { id: true, scheduledAt: true, status: true, title: true }, orderBy: { scheduledAt: 'asc' } } } });
    return v.map(({ trips, ...x }) => ({ ...x, upcomingTrips: trips.length, nextTrip: trips.find((t) => t.scheduledAt >= now) ?? null, onTrip: trips.some((t) => t.status === 'IN_PROGRESS') }));
  }
  async createVehicle(dto: CreateVehicleDto, actor: AuthUser) {
    await this.assertPlateFree(dto.plate);
    try {
      const v = await this.prisma.vehicle.create({ data: { ...dto, plate: tidyPlate(dto.plate) } });
      await this.audit.log({ actorId: actor.id, entity: 'Vehicle', entityId: v.id, action: 'create', message: `Added vehicle ${v.plate}` });
      return v;
    } catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A vehicle with this plate already exists'); throw e; }
  }
  private async assertPlateFree(plate: string, ignoreId?: string) {
    const all = await this.prisma.vehicle.findMany({ select: { id: true, plate: true } });
    if (all.some((v) => v.id !== ignoreId && normPlate(v.plate) === normPlate(plate))) throw new ConflictException('A vehicle with this plate already exists');
  }
  async updateVehicle(id: string, dto: UpdateVehicleDto, actor: AuthUser) {
    if (dto.plate) await this.assertPlateFree(dto.plate, id);
    try {
      const v = await this.prisma.vehicle.update({ where: { id }, data: { ...dto, ...(dto.plate ? { plate: tidyPlate(dto.plate) } : {}) } });
      await this.audit.log({ actorId: actor.id, entity: 'Vehicle', entityId: id, action: 'update', message: `Updated vehicle ${v.plate}` });
      return v;
    } catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A vehicle with this plate already exists'); throw new NotFoundException('Vehicle not found'); }
  }
  async deleteVehicle(id: string, actor: AuthUser) {
    const v = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Vehicle not found');
    if (await this.prisma.trip.count({ where: { vehicleId: id, status: { in: BUSY } } })) throw new ConflictException('Vehicle has scheduled trips; reassign them first');
    await this.prisma.vehicle.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, entity: 'Vehicle', entityId: id, action: 'delete', message: `Removed vehicle ${v.plate}` });
    return { ok: true };
  }

  async drivers() {
    const now = new Date();
    const d = await this.prisma.driver.findMany({ orderBy: { name: 'asc' }, include: { vendor: { select: { id: true, name: true } }, trips: { where: { status: { in: BUSY }, scheduledAt: { gte: new Date(now.getTime() - 864e5) } }, select: { id: true, scheduledAt: true, status: true } } } });
    return d.map(({ trips, ...x }) => ({ ...x, upcomingTrips: trips.length, onTrip: trips.some((t) => t.status === 'IN_PROGRESS') }));
  }
  async createDriver(dto: CreateDriverDto, actor: AuthUser) {
    const d = await this.prisma.driver.create({ data: dto });
    await this.audit.log({ actorId: actor.id, entity: 'Driver', entityId: d.id, action: 'create', message: `Added driver ${d.name}` });
    return d;
  }
  async updateDriver(id: string, dto: UpdateDriverDto, actor: AuthUser) {
    const d = await this.prisma.driver.update({ where: { id }, data: dto }).catch(() => { throw new NotFoundException('Driver not found'); });
    await this.audit.log({ actorId: actor.id, entity: 'Driver', entityId: id, action: 'update', message: `Updated driver ${d.name}` });
    return d;
  }
  async deleteDriver(id: string, actor: AuthUser) {
    const d = await this.prisma.driver.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Driver not found');
    if (await this.prisma.trip.count({ where: { driverId: id, status: { in: BUSY } } })) throw new ConflictException('Driver has scheduled trips; reassign them first');
    await this.prisma.driver.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, entity: 'Driver', entityId: id, action: 'delete', message: `Removed driver ${d.name}` });
    return { ok: true };
  }

  // ---------------------------------------------------------------- trips
  async trips(q: TripQuery) {
    const where: Prisma.TripWhereInput = {
      ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.driverId ? { driverId: q.driverId } : {}), ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
      ...(q.from || q.to ? { scheduledAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    const rows = await this.prisma.trip.findMany({ where, orderBy: { scheduledAt: 'asc' }, take: 500, include: tripInclude });
    return rows.map((t) => ({ ...t, seatsUsed: t.passengers.filter((p) => p.status !== 'CANCELLED').reduce((s, p) => s + p.passengers, 0) }));
  }

  private async assertFree(tx: Prisma.TransactionClient, t: { vehicleId?: string | null; driverId?: string | null; scheduledAt: Date }, ignoreTripId?: string) {
    const gap = TRIP_GAP_MIN * 60000;
    const window = { gt: new Date(t.scheduledAt.getTime() - gap), lt: new Date(t.scheduledAt.getTime() + gap) };
    if (t.vehicleId) {
      const c = await tx.trip.findFirst({ where: { vehicleId: t.vehicleId, status: { in: BUSY }, scheduledAt: window, ...(ignoreTripId ? { id: { not: ignoreTripId } } : {}) }, include: { vehicle: true } });
      if (c) throw new ConflictException(`Vehicle ${c.vehicle?.plate} already has "${c.title}" within ${TRIP_GAP_MIN} minutes of this time`);
    }
    if (t.driverId) {
      const c = await tx.trip.findFirst({ where: { driverId: t.driverId, status: { in: BUSY }, scheduledAt: window, ...(ignoreTripId ? { id: { not: ignoreTripId } } : {}) }, include: { driver: true } });
      if (c) throw new ConflictException(`Driver ${c.driver?.name} already has "${c.title}" within ${TRIP_GAP_MIN} minutes of this time`);
    }
  }
  private async assertResources(tx: Prisma.TransactionClient, vehicleId?: string | null, driverId?: string | null) {
    if (vehicleId) { const v = await tx.vehicle.findUnique({ where: { id: vehicleId } }); if (!v || !v.active) throw new BadRequestException('Vehicle is not available'); }
    if (driverId) { const d = await tx.driver.findUnique({ where: { id: driverId } }); if (!d || !d.active) throw new BadRequestException('Driver is not available'); }
  }

  async createTrip(dto: CreateTripDto, actor: AuthUser) {
    const t = await this.prisma.$transaction(async (tx) => {
      if (!(await tx.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
      await this.assertResources(tx, dto.vehicleId, dto.driverId);
      const scheduledAt = new Date(dto.scheduledAt);
      await this.assertFree(tx, { vehicleId: dto.vehicleId, driverId: dto.driverId, scheduledAt });
      return tx.trip.create({ data: { ...dto, scheduledAt }, include: tripInclude });
    });
    await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'Trip', entityId: t.id, action: 'create', message: `Trip "${t.title}" ${t.origin} to ${t.destination}` });
    this.rt.toWedding(t.weddingId, 'transport.updated', { tripId: t.id });
    return t;
  }
  async updateTrip(id: string, dto: UpdateTripDto, actor: AuthUser) {
    const prev = await this.prisma.trip.findUnique({ where: { id }, include: { passengers: true } });
    if (!prev) throw new NotFoundException('Trip not found');
    if (prev.status === 'COMPLETED') throw new BadRequestException('A completed trip cannot be edited');
    const t = await this.prisma.$transaction(async (tx) => {
      const vehicleId = dto.vehicleId !== undefined ? dto.vehicleId : prev.vehicleId, driverId = dto.driverId !== undefined ? dto.driverId : prev.driverId;
      const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : prev.scheduledAt;
      await this.assertResources(tx, vehicleId, driverId);
      if (BUSY.includes(prev.status)) await this.assertFree(tx, { vehicleId, driverId, scheduledAt }, id);
      if (vehicleId) {
        const v = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
        const used = prev.passengers.filter((p) => p.status !== 'CANCELLED').reduce((s, p) => s + p.passengers, 0);
        if (used > v.capacity) throw new ConflictException(`Vehicle ${v.plate} seats ${v.capacity} but ${used} passengers are assigned`);
      }
      const { weddingId: _w, ...rest } = dto;
      return tx.trip.update({ where: { id }, data: { ...rest, scheduledAt }, include: tripInclude });
    });
    await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'Trip', entityId: id, action: 'update', message: `Updated trip "${t.title}"` });
    this.rt.toWedding(t.weddingId, 'transport.updated', { tripId: id });
    return t;
  }
  async setTripStatus(id: string, status: TripStatus, actor: AuthUser) {
    const prev = await this.prisma.trip.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Trip not found');
    if (prev.status === status) return this.prisma.trip.findUniqueOrThrow({ where: { id }, include: tripInclude });
    if (!canMoveTrip(prev.status, status)) throw new BadRequestException(`A ${prev.status.toLowerCase().replace('_', ' ')} trip cannot become ${status.toLowerCase().replace('_', ' ')}`);
    const now = new Date();
    const t = await this.prisma.$transaction(async (tx) => {
      if (status === 'SCHEDULED') await this.assertFree(tx, prev, id);
      if (status === 'IN_PROGRESS') await tx.guestTransport.updateMany({ where: { tripId: id, kind: 'PICKUP', status: 'ASSIGNED' }, data: { status: 'PICKED_UP' } });
      if (status === 'COMPLETED') {
        await tx.guestTransport.updateMany({ where: { tripId: id, kind: 'PICKUP', status: { in: ['ASSIGNED', 'PICKED_UP'] } }, data: { status: 'PICKED_UP' } });
        await tx.guestTransport.updateMany({ where: { tripId: id, kind: 'DROP', status: { in: ['ASSIGNED', 'PICKED_UP'] } }, data: { status: 'DROPPED' } });
      }
      if (status === 'CANCELLED') await tx.guestTransport.updateMany({ where: { tripId: id, status: { in: ['ASSIGNED', 'PICKED_UP'] } }, data: { status: 'PENDING', tripId: null } });
      return tx.trip.update({ where: { id }, data: { status, ...(status === 'IN_PROGRESS' ? { startedAt: now } : {}), ...(status === 'COMPLETED' ? { completedAt: now, startedAt: prev.startedAt ?? now } : {}), ...(status === 'SCHEDULED' ? { startedAt: null, completedAt: null } : {}) }, include: tripInclude });
    });
    await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'Trip', entityId: id, action: 'status', message: `Trip "${t.title}" ${prev.status} → ${t.status}` });
    this.rt.toWedding(t.weddingId, 'transport.updated', { tripId: id, status });
    return t;
  }
  async deleteTrip(id: string, actor: AuthUser) {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Trip not found');
    if (t.status === 'IN_PROGRESS') throw new BadRequestException('Cannot delete a trip in progress');
    await this.prisma.$transaction([this.prisma.guestTransport.updateMany({ where: { tripId: id, status: { in: ['ASSIGNED', 'PICKED_UP'] } }, data: { status: 'PENDING' } }), this.prisma.trip.delete({ where: { id } })]);
    await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'Trip', entityId: id, action: 'delete', message: `Removed trip "${t.title}"` });
    this.rt.toWedding(t.weddingId, 'transport.updated', { tripId: id, deleted: true });
    return { ok: true };
  }

  // ---------------------------------------------------------------- guest pickups / drops
  guestTransport(q: GuestTransportQuery) {
    return this.prisma.guestTransport.findMany({
      where: {
        ...(q.weddingId ? { guest: { weddingId: q.weddingId } } : {}), ...(q.kind ? { kind: q.kind } : {}), ...(q.status ? { status: q.status } : {}), ...(q.tripId ? { tripId: q.tripId } : {}), ...(q.unassigned ? { tripId: null, status: { not: 'CANCELLED' } } : {}),
        ...(q.search ? { OR: [{ guest: { name: { contains: q.search, mode: 'insensitive' } } }, { flightOrTrain: { contains: q.search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ arrivalAt: 'asc' }, { createdAt: 'asc' }], take: 1000, include: gtInclude,
    });
  }

  /** Seats already used on the trip (excluding one booking being edited) must fit the vehicle. */
  private async assertSeats(tx: Prisma.TransactionClient, tripId: string, adding: number, ignoreId?: string) {
    const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { vehicle: true, passengers: true } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') throw new BadRequestException(`Trip is ${trip.status.toLowerCase()}`);
    const used = trip.passengers.filter((p) => p.status !== 'CANCELLED' && p.id !== ignoreId).reduce((s, p) => s + p.passengers, 0);
    if (trip.vehicle && used + adding > trip.vehicle.capacity) throw new ConflictException(`Vehicle ${trip.vehicle.plate} seats ${trip.vehicle.capacity}; ${used} already booked, ${adding} more will not fit`);
    return trip;
  }
  async createGuestTransport(dto: CreateGuestTransportDto, actor: AuthUser) {
    const g = await this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findUnique({ where: { id: dto.guestId } });
      if (!guest) throw new NotFoundException('Guest not found');
      const passengers = dto.passengers ?? 1 + (guest.plusOnes ?? 0);
      if (dto.tripId) { const trip = await this.assertSeats(tx, dto.tripId, passengers); if (trip.weddingId !== guest.weddingId) throw new BadRequestException('Trip belongs to a different wedding'); }
      return tx.guestTransport.create({ data: { guestId: dto.guestId, kind: dto.kind ?? 'PICKUP', flightOrTrain: dto.flightOrTrain, arrivalAt: dto.arrivalAt ? new Date(dto.arrivalAt) : undefined, passengers, notes: dto.notes, tripId: dto.tripId, status: dto.tripId ? 'ASSIGNED' : 'PENDING' }, include: gtInclude });
    });
    await this.audit.log({ actorId: actor.id, weddingId: g.guest.weddingId, entity: 'GuestTransport', entityId: g.id, action: 'create', message: `${g.kind === 'DROP' ? 'Drop' : 'Pickup'} requested for ${g.guest.name}` });
    this.rt.toWedding(g.guest.weddingId, 'transport.updated', { guestTransportId: g.id });
    return g;
  }
  async updateGuestTransport(id: string, dto: UpdateGuestTransportDto, actor: AuthUser) {
    const prev = await this.prisma.guestTransport.findUnique({ where: { id }, include: { guest: true } });
    if (!prev) throw new NotFoundException('Booking not found');
    const g = await this.prisma.$transaction(async (tx) => {
      const passengers = dto.passengers ?? prev.passengers;
      let status = dto.status;
      let tripId = dto.tripId === undefined ? prev.tripId : dto.tripId;
      if (tripId && (dto.tripId !== undefined || dto.passengers !== undefined)) {
        const trip = await this.assertSeats(tx, tripId, passengers, id);
        if (trip.weddingId !== prev.guest.weddingId) throw new BadRequestException('Trip belongs to a different wedding');
        if (!status && prev.status === 'PENDING') status = 'ASSIGNED';
      }
      if (dto.tripId === null) { tripId = null; if (!status && ['ASSIGNED'].includes(prev.status)) status = 'PENDING'; }
      if ((status === 'ASSIGNED') && !tripId) throw new BadRequestException('Assign a trip before marking as assigned');
      const { tripId: _t, status: _s, arrivalAt, ...rest } = dto;
      return tx.guestTransport.update({ where: { id }, data: { ...rest, tripId, ...(status ? { status } : {}), ...(arrivalAt ? { arrivalAt: new Date(arrivalAt) } : {}) }, include: gtInclude });
    });
    await this.audit.log({ actorId: actor.id, weddingId: prev.guest.weddingId, entity: 'GuestTransport', entityId: id, action: dto.status ? dto.status.toLowerCase() : 'update', message: dto.status && dto.status !== prev.status ? `${prev.guest.name}: ${prev.status} → ${g.status}` : `Updated transport for ${prev.guest.name}` });
    this.rt.toWedding(prev.guest.weddingId, 'transport.updated', { guestTransportId: id });
    return g;
  }
  async deleteGuestTransport(id: string, actor: AuthUser) {
    const prev = await this.prisma.guestTransport.findUnique({ where: { id }, include: { guest: true } });
    if (!prev) throw new NotFoundException('Booking not found');
    await this.prisma.guestTransport.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, weddingId: prev.guest.weddingId, entity: 'GuestTransport', entityId: id, action: 'delete', message: `Removed transport for ${prev.guest.name}` });
    this.rt.toWedding(prev.guest.weddingId, 'transport.updated', { guestTransportId: id, deleted: true });
    return { ok: true };
  }

  async stats(q: TransportStatsQuery) {
    const gw: Prisma.GuestTransportWhereInput = q.weddingId ? { guest: { weddingId: q.weddingId } } : {};
    const tw: Prisma.TripWhereInput = q.weddingId ? { weddingId: q.weddingId } : {};
    const [vehicles, drivers, trips, gts, unassigned] = await Promise.all([
      this.prisma.vehicle.count({ where: { active: true } }), this.prisma.driver.count({ where: { active: true } }),
      this.prisma.trip.groupBy({ by: ['status'], where: tw, _count: true }),
      this.prisma.guestTransport.groupBy({ by: ['status'], where: gw, _count: true }),
      this.prisma.guestTransport.count({ where: { ...gw, tripId: null, status: { not: 'CANCELLED' } } }),
    ]);
    const t = (s: TripStatus) => trips.find((x) => x.status === s)?._count ?? 0, g = (s: GuestTransportStatus) => gts.find((x) => x.status === s)?._count ?? 0;
    return { vehicles, drivers, trips: { scheduled: t('SCHEDULED'), inProgress: t('IN_PROGRESS'), completed: t('COMPLETED'), cancelled: t('CANCELLED') }, guests: { pending: g('PENDING'), assigned: g('ASSIGNED'), pickedUp: g('PICKED_UP'), dropped: g('DROPPED'), cancelled: g('CANCELLED'), unassigned } };
  }

  // ---------------------------------------------------------------- client portal (read-only)
  async forClient(user: AuthUser) {
    const ids = await this.scope.requireClientWeddingIds(user);
    const [guests, trips] = await Promise.all([
      this.prisma.guestTransport.findMany({ where: { guest: { weddingId: { in: ids } }, status: { not: 'CANCELLED' } }, orderBy: [{ arrivalAt: 'asc' }], include: gtInclude }),
      this.prisma.trip.findMany({ where: { weddingId: { in: ids }, status: { not: 'CANCELLED' } }, orderBy: { scheduledAt: 'asc' }, select: { id: true, title: true, origin: true, destination: true, scheduledAt: true, status: true, vehicle: { select: { plate: true, type: true, capacity: true } }, driver: { select: { name: true, phone: true } } } }),
    ]);
    return { summary: { trips: trips.length, upcomingTrips: trips.filter((t) => t.status === 'SCHEDULED').length, pickups: guests.filter((g) => g.kind === 'PICKUP').length, drops: guests.filter((g) => g.kind === 'DROP').length, pending: guests.filter((g) => g.status === 'PENDING').length }, trips, guests };
  }
}
