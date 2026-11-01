import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { AccommodationStatsQuery, AllocateDto, AllocationQuery, BulkRoomsDto, CreateHotelDto, CreateRoomDto, RoomQuery, UpdateAllocationDto, UpdateHotelDto, UpdateRoomDto } from './accommodation.dto';
import { AccommodationService } from './accommodation.service';

@ApiTags('accommodation') @ApiCookieAuth() @Controller('accommodation') @Roles(G.EVENT_OPS)
export class AccommodationController {
  constructor(private svc: AccommodationService) {}
  @Get('hotels') hotels(@Query('search') search?: string) { return this.svc.hotels(search); }
  @Post('hotels') createHotel(@Body() dto: CreateHotelDto, @CurrentUser() u: AuthUser) { return this.svc.createHotel(dto, u); }
  @Patch('hotels/:id') updateHotel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHotelDto, @CurrentUser() u: AuthUser) { return this.svc.updateHotel(id, dto, u); }
  @Delete('hotels/:id') deleteHotel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteHotel(id, u); }
  @Get('hotels/:id/rooms') rooms(@Param('id', ParseUUIDPipe) id: string, @Query() q: RoomQuery) { return this.svc.rooms(id, q); }
  @Post('hotels/:id/rooms') createRoom(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRoomDto, @CurrentUser() u: AuthUser) { return this.svc.createRoom(id, dto, u); }
  @Post('hotels/:id/rooms/bulk') bulkRooms(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BulkRoomsDto, @CurrentUser() u: AuthUser) { return this.svc.bulkRooms(id, dto, u); }
  @Patch('rooms/:id') updateRoom(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto, @CurrentUser() u: AuthUser) { return this.svc.updateRoom(id, dto, u); }
  @Delete('rooms/:id') deleteRoom(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteRoom(id, u); }

  @Get('allocations') allocations(@Query() q: AllocationQuery, @CurrentUser() u: AuthUser) { return this.svc.allocations(q, u); }
  @Get('weddings/:weddingId/unallocated-guests') unallocated(@Param('weddingId', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.unallocatedGuests(id, u); }
  @Post('allocations') allocate(@Body() dto: AllocateDto, @CurrentUser() u: AuthUser) { return this.svc.allocate(dto, u); }
  @Patch('allocations/:id') updateAllocation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAllocationDto, @CurrentUser() u: AuthUser) { return this.svc.updateAllocation(id, dto, u); }
  @Post('allocations/:id/checkin') checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.checkIn(id, u); }
  @Post('allocations/:id/checkout') checkOut(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.checkOut(id, u); }
  @Post('allocations/:id/cancel') cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.cancel(id, u); }
  @Delete('allocations/:id') remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.remove(id, u); }
  @Get('stats') stats(@Query() q: AccommodationStatsQuery, @CurrentUser() u: AuthUser) { return this.svc.stats(q, u); }
}

/** Read-only view for the couple, scoped to their own wedding(s). */
@ApiTags('client portal') @ApiCookieAuth() @Controller('portal/client/accommodation') @Roles(G.CLIENT_PORTAL)
export class ClientAccommodationController {
  constructor(private svc: AccommodationService) {}
  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.forClient(u); }
}
