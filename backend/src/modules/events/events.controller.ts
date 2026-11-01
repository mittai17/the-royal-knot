import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { ActualGuestsDto, ArrivalDto, CreateIncidentDto, CreateTimelineDto, EventStatusDto, UpdateIncidentDto, UpdateTimelineDto } from './events.dto';
import { EventsService } from './events.service';

@ApiTags('event command centre') @ApiCookieAuth() @Controller()
export class EventsController {
  constructor(private svc: EventsService) {}
  @Get('command-centre/live') live(@CurrentUser() u: AuthUser) { return this.svc.live(u); }
  @Get('weddings/:id/event') bundle(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.bundle(id, u); }
  @Post('weddings/:id/timeline') @Roles(G.EVENT_OPS) addTimeline(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTimelineDto, @CurrentUser() u: AuthUser) { return this.svc.addTimeline(id, dto, u); }
  @Patch('timeline/:id') @Roles(G.EVENT_OPS) updateTimeline(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTimelineDto, @CurrentUser() u: AuthUser) { return this.svc.updateTimeline(id, dto, u); }
  @Delete('timeline/:id') @Roles(G.EVENT_OPS) deleteTimeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteTimeline(id, u); }
  @Post('wedding-vendors/:id/arrival') @Roles(G.EVENT_OPS) arrival(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ArrivalDto, @CurrentUser() u: AuthUser) { return this.svc.setArrival(id, dto, u); }
  @Post('weddings/:id/incidents') @Roles(G.EVENT_OPS) createIncident(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateIncidentDto, @CurrentUser() u: AuthUser) { return this.svc.createIncident(id, dto, u); }
  @Patch('incidents/:id') @Roles(G.EVENT_OPS) updateIncident(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIncidentDto, @CurrentUser() u: AuthUser) { return this.svc.updateIncident(id, dto, u); }
  @Get('incidents/:id/history') history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.incidentHistory(id, u); }
  @Patch('weddings/:id/event-status') @Roles(G.EVENT_OPS) status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EventStatusDto, @CurrentUser() u: AuthUser) { return this.svc.setStatus(id, dto, u); }
  @Post('weddings/:id/actual-guests') @Roles(G.EVENT_OPS) actual(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualGuestsDto, @CurrentUser() u: AuthUser) { return this.svc.setActualGuests(id, dto, u); }
}
