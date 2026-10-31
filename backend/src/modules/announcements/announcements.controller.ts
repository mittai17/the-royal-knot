import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { PageQuery } from '../../common/pagination';
import { AnnouncementQuery, CreateAnnouncementDto, UpdateAnnouncementDto } from './announcements.dto';
import { AnnouncementsService } from './announcements.service';

@ApiTags('announcements') @ApiCookieAuth() @Controller('announcements')
export class AnnouncementsController {
  constructor(private svc: AnnouncementsService) {}
  /** Own feed (every staff role) with read state. Declared before ':id' routes. */
  @Get('feed') @Roles(G.STAFF) feed(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.svc.feed(u, q); }
  @Get('unread') @Roles(G.STAFF) unread(@CurrentUser() u: AuthUser) { return this.svc.unreadCount(u); }
  @Post('read-all') @Roles(G.STAFF) readAll(@CurrentUser() u: AuthUser) { return this.svc.markAllRead(u); }
  @Get() @Roles(Role.PLANNER, Role.EVENT_MANAGER) manage(@Query() q: AnnouncementQuery) { return this.svc.manage(q); }
  @Post() @Roles(Role.PLANNER) create(@CurrentUser() u: AuthUser, @Body() dto: CreateAnnouncementDto) { return this.svc.create(u, dto); }
  @Post(':id/read') @Roles(G.STAFF) read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(u, id); }
  @Patch(':id') @Roles(Role.PLANNER) update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @Roles(Role.PLANNER) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}

abstract class PortalAnnouncements {
  constructor(protected svc: AnnouncementsService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.svc.feed(u, q); }
  @Get('unread') unread(@CurrentUser() u: AuthUser) { return this.svc.unreadCount(u); }
  @Post('read-all') readAll(@CurrentUser() u: AuthUser) { return this.svc.markAllRead(u); }
  @Post(':id/read') read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(u, id); }
}

@ApiTags('portal-client') @ApiCookieAuth() @Controller('portal/client/announcements') @Roles(Role.CLIENT)
export class ClientAnnouncementsController extends PortalAnnouncements { constructor(svc: AnnouncementsService) { super(svc); } }

@ApiTags('portal-vendor') @ApiCookieAuth() @Controller('portal/vendor/announcements') @Roles(Role.VENDOR)
export class VendorAnnouncementsController extends PortalAnnouncements { constructor(svc: AnnouncementsService) { super(svc); } }
