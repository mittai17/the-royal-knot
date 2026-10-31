import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateDriverDto, CreateGuestTransportDto, CreateTripDto, CreateVehicleDto, GuestTransportQuery, TransportStatsQuery, TripQuery, TripStatusDto, UpdateDriverDto, UpdateGuestTransportDto, UpdateTripDto, UpdateVehicleDto } from './transport.dto';
import { TransportService } from './transport.service';

@ApiTags('transport') @ApiCookieAuth() @Controller('transport') @Roles(G.EVENT_OPS)
export class TransportController {
  constructor(private svc: TransportService) {}
  @Get('stats') stats(@Query() q: TransportStatsQuery) { return this.svc.stats(q); }
  @Get('vehicles') vehicles() { return this.svc.vehicles(); }
  @Post('vehicles') createVehicle(@Body() dto: CreateVehicleDto, @CurrentUser() u: AuthUser) { return this.svc.createVehicle(dto, u); }
  @Patch('vehicles/:id') updateVehicle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto, @CurrentUser() u: AuthUser) { return this.svc.updateVehicle(id, dto, u); }
  @Delete('vehicles/:id') deleteVehicle(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteVehicle(id, u); }
  @Get('drivers') drivers() { return this.svc.drivers(); }
  @Post('drivers') createDriver(@Body() dto: CreateDriverDto, @CurrentUser() u: AuthUser) { return this.svc.createDriver(dto, u); }
  @Patch('drivers/:id') updateDriver(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto, @CurrentUser() u: AuthUser) { return this.svc.updateDriver(id, dto, u); }
  @Delete('drivers/:id') deleteDriver(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteDriver(id, u); }
  @Get('trips') trips(@Query() q: TripQuery) { return this.svc.trips(q); }
  @Post('trips') createTrip(@Body() dto: CreateTripDto, @CurrentUser() u: AuthUser) { return this.svc.createTrip(dto, u); }
  @Patch('trips/:id') updateTrip(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTripDto, @CurrentUser() u: AuthUser) { return this.svc.updateTrip(id, dto, u); }
  @Post('trips/:id/status') tripStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TripStatusDto, @CurrentUser() u: AuthUser) { return this.svc.setTripStatus(id, dto.status, u); }
  @Delete('trips/:id') deleteTrip(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteTrip(id, u); }
  @Get('guest-transport') guestTransport(@Query() q: GuestTransportQuery) { return this.svc.guestTransport(q); }
  @Post('guest-transport') createGuestTransport(@Body() dto: CreateGuestTransportDto, @CurrentUser() u: AuthUser) { return this.svc.createGuestTransport(dto, u); }
  @Patch('guest-transport/:id') updateGuestTransport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGuestTransportDto, @CurrentUser() u: AuthUser) { return this.svc.updateGuestTransport(id, dto, u); }
  @Delete('guest-transport/:id') deleteGuestTransport(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteGuestTransport(id, u); }
}

@ApiTags('client portal') @ApiCookieAuth() @Controller('portal/client/transport') @Roles(G.CLIENT_PORTAL)
export class ClientTransportController {
  constructor(private svc: TransportService) {}
  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.forClient(u); }
}
