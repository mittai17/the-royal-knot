import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { NotificationPrefsDto, PortalSettings, UpdateProfileDto } from '../../common/portal-settings';
import { G } from '../../common/permissions';
import { CreateGuestDto, GuestQuery, ImportGuestsDto, UpdateGuestDto } from '../guests/guests.dto';
import { InviteDto, StoryDto } from './portal-client.dto';
import { PortalClientService } from './portal-client.service';

class MilestoneIdQuery { @IsUUID() milestoneId: string; }

/** Everything here is scoped to the signed-in couple's own wedding(s) through ScopeService (see PortalClientService.resolveWedding). */
@ApiTags('portal / client') @ApiCookieAuth() @Controller('portal/client') @Roles(G.CLIENT_PORTAL)
export class PortalClientController {
  constructor(private svc: PortalClientService, private settings: PortalSettings) {}

  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser, @Query('weddingId') weddingId?: string) { return this.svc.dashboard(u, weddingId); }
  @Get('wedding') wedding(@CurrentUser() u: AuthUser, @Query('weddingId') weddingId?: string) { return this.svc.wedding(u, weddingId); }
  @Patch('wedding/story') story(@CurrentUser() u: AuthUser, @Body() dto: StoryDto) { return this.svc.setStory(u, dto.story); }
  @Get('planner') planner(@CurrentUser() u: AuthUser) { return this.svc.planner(u); }
  @Get('schedule') schedule(@CurrentUser() u: AuthUser, @Query('weddingId') weddingId?: string) { return this.svc.schedule(u, weddingId); }
  @Get('vendors') vendors(@CurrentUser() u: AuthUser, @Query('weddingId') weddingId?: string) { return this.svc.vendors(u, weddingId); }

  @Get('guests') guests(@CurrentUser() u: AuthUser, @Query() q: GuestQuery) { return this.svc.guestList(u, q); }
  @Get('guests/stats') guestStats(@CurrentUser() u: AuthUser) { return this.svc.guestStats(u); }
  @Post('guests') addGuest(@CurrentUser() u: AuthUser, @Body() dto: CreateGuestDto) { return this.svc.addGuest(u, dto); }
  @Post('guests/import') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  importGuests(@CurrentUser() u: AuthUser, @Body() dto: ImportGuestsDto, @UploadedFile() file?: Express.Multer.File) {
    const csv = file ? file.buffer.toString('utf8') : dto.csv;
    if (!csv) throw new BadRequestException('Provide a CSV file (field "file") or a "csv" string');
    return this.svc.importGuests(u, csv);
  }
  @Post('guests/invite') invite(@CurrentUser() u: AuthUser, @Body() dto: InviteDto) { return this.svc.invite(u, dto); }
  @Patch('guests/:id') updateGuest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGuestDto) { return this.svc.updateGuest(u, id, dto); }
  @Delete('guests/:id') removeGuest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.removeGuest(u, id); }

  @Get('documents') documents(@CurrentUser() u: AuthUser) { return this.svc.documents(u); }
  @Get('documents/:id/download') download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.downloadDocument(u, id, false); }
  @Get('documents/:id/preview') preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.downloadDocument(u, id, true); }
  @Get('agreements/:id/pdf') agreementPdf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.agreementPdf(u, id); }

  @Get('payments') payments(@CurrentUser() u: AuthUser) { return this.svc.paymentsOverview(u); }
  @Get('payments/upi-qr') upiQr(@CurrentUser() u: AuthUser, @Query() q: MilestoneIdQuery) { return this.svc.upiQr(u, q.milestoneId); }
  @Get('payments/:id/receipt') receipt(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.receiptPdf(u, id); }

  @Get('settings') getSettings(@CurrentUser() u: AuthUser) { return this.settings.get(u); }
  @Patch('settings/profile') profile(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) { return this.settings.updateProfile(u, dto); }
  @Patch('settings/notifications') prefs(@CurrentUser() u: AuthUser, @Body() dto: NotificationPrefsDto) { return this.settings.updatePrefs(u, dto); }
}
