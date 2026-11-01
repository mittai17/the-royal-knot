import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { ArrivalQuery, CalendarQuery, CreateFunctionDto, DayQuery, FunctionQuery, IncidentQuery, NotifyVendorDto, UpdateFunctionDto } from './event-ops.dto';
import { EventOpsService } from './event-ops.service';

/** Event operations: functions, today's schedule, vendor check-in board, incident register, calendar. Per-wedding run-sheet endpoints stay in EventsController. */
@ApiTags('event operations') @ApiCookieAuth() @Controller('events') @Roles(G.EVENT_OPS)
export class EventOpsController {
  constructor(private svc: EventOpsService) {}

  @Get('functions') functions(@Query() q: FunctionQuery, @CurrentUser() u: AuthUser) { return this.svc.functions(q, u); }
  @Get('functions/:id') function(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.functionById(id, u); }
  @Post('functions') @Roles(G.PLANNING) createFunction(@Body() dto: CreateFunctionDto, @CurrentUser() u: AuthUser) { return this.svc.createFunction(dto, u); }
  @Patch('functions/:id') @Roles(G.PLANNING) updateFunction(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFunctionDto, @CurrentUser() u: AuthUser) { return this.svc.updateFunction(id, dto, u); }
  @Delete('functions/:id') @Roles(G.PLANNING) deleteFunction(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteFunction(id, u); }

  @Get('today') today(@Query() q: DayQuery, @CurrentUser() u: AuthUser) { return this.svc.today(q, u); }
  @Get('arrivals') arrivals(@Query() q: ArrivalQuery, @CurrentUser() u: AuthUser) { return this.svc.arrivals(q, u); }
  @Post('arrivals/:weddingVendorId/notify') notifyVendor(@Param('weddingVendorId', ParseUUIDPipe) id: string, @Body() dto: NotifyVendorDto, @CurrentUser() u: AuthUser) { return this.svc.notifyVendor(id, dto.message, u); }

  @Get('incidents') incidents(@Query() q: IncidentQuery, @CurrentUser() u: AuthUser) { return this.svc.incidents(q, u); }
  @Get('incidents/stats') incidentStats(@CurrentUser() u: AuthUser, @Query('weddingId') weddingId?: string) { return this.svc.incidentStats(weddingId, u); }

  @Get('calendar') calendar(@Query() q: CalendarQuery, @CurrentUser() u: AuthUser) { return this.svc.calendar(q, u); }
}
