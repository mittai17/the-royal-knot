import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DocumentCategory } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { NotificationPrefsDto, PortalSettings, UpdateProfileDto } from '../../common/portal-settings';
import { MAX_UPLOAD } from '../documents/documents.service';
import { AvailabilityDto, CheckDto, DeliverableDto, PortalQuotationDto, RespondDto, RfqListQuery, ServiceDto, UpdateServiceDto, UpdateVendorProfileDto, UploadDocDto, VendorTaskDto } from './portal-vendor.dto';
import { PortalVendorService } from './portal-vendor.service';

/** Everything here is scoped to the signed-in vendor's own record (User.vendorId) through ScopeService. */
@ApiTags('portal / vendor') @ApiCookieAuth() @Controller('portal/vendor') @Roles(G.VENDOR_PORTAL)
export class PortalVendorController {
  constructor(private svc: PortalVendorService, private settings: PortalSettings) {}

  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser) { return this.svc.dashboard(u); }
  @Get('bookings') bookings(@CurrentUser() u: AuthUser) { return this.svc.bookings(u); }
  @Get('contracts') contracts(@CurrentUser() u: AuthUser) { return this.svc.contracts(u); }

  @Get('rfqs') rfqs(@CurrentUser() u: AuthUser, @Query() q: RfqListQuery) { return this.svc.rfqs(u, q); }
  @Get('rfqs/:id') rfq(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.rfq(u, id); }
  @Post('rfqs/:id/quotation') submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalQuotationDto) { return this.svc.submitQuotation(u, id, dto); }
  @Get('quotations') quotations(@CurrentUser() u: AuthUser) { return this.svc.quotationList(u); }
  @Get('quotations/:id/pdf') quotationPdf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.quotationPdf(u, id); }

  @Get('schedule') schedule(@CurrentUser() u: AuthUser) { return this.svc.schedule(u); }
  @Get('deliverables') deliverables(@CurrentUser() u: AuthUser) { return this.svc.deliverables(u); }
  @Patch('deliverables/:bookingId/:itemId') deliverable(@CurrentUser() u: AuthUser, @Param('bookingId', ParseUUIDPipe) b: string, @Param('itemId') item: string, @Body() dto: DeliverableDto) { return this.svc.setDeliverable(u, b, item, dto.done, dto.note); }

  @Get('check-in') board(@CurrentUser() u: AuthUser) { return this.svc.checkInBoard(u); }
  @Post('check-in/:bookingId/arrive') arrive(@CurrentUser() u: AuthUser, @Param('bookingId', ParseUUIDPipe) id: string, @Body() dto: CheckDto) { return this.svc.checkIn(u, id, dto.notes); }
  @Post('check-in/:bookingId/depart') depart(@CurrentUser() u: AuthUser, @Param('bookingId', ParseUUIDPipe) id: string, @Body() dto: CheckDto) { return this.svc.checkOut(u, id, dto.notes); }

  @Get('profile') profile(@CurrentUser() u: AuthUser) { return this.svc.profile(u); }
  @Patch('profile') updateProfile(@CurrentUser() u: AuthUser, @Body() dto: UpdateVendorProfileDto) { return this.svc.updateProfile(u, dto); }
  @Put('profile/availability') availability(@CurrentUser() u: AuthUser, @Body() dto: AvailabilityDto) { return this.svc.setAvailability(u, dto); }
  @Post('profile/services') addService(@CurrentUser() u: AuthUser, @Body() dto: ServiceDto) { return this.svc.addService(u, dto); }
  @Patch('profile/services/:id') updateService(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) { return this.svc.updateService(u, id, dto); }
  @Delete('profile/services/:id') removeService(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.removeService(u, id); }

  @Get('documents') documents(@CurrentUser() u: AuthUser, @Query('category') category?: DocumentCategory) { return this.svc.documentsList(u, category); }
  @Post('documents') @ApiConsumes('multipart/form-data') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: UploadDocDto) { return this.svc.uploadDocument(u, file, body); }
  @Get('documents/:id/download') download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.downloadDocument(u, id, false); }
  @Get('documents/:id/preview') preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.downloadDocument(u, id, true); }

  @Get('reviews') reviews(@CurrentUser() u: AuthUser) { return this.svc.reviews(u); }
  @Post('reviews/:id/respond') respond(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondDto) { return this.svc.respond(u, id, dto.text); }

  @Get('tasks') tasks(@CurrentUser() u: AuthUser) { return this.svc.taskList(u); }
  @Patch('tasks/:id') task(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorTaskDto) { return this.svc.updateTask(u, id, dto); }

  @Get('settings') getSettings(@CurrentUser() u: AuthUser) { return this.settings.get(u); }
  @Patch('settings/profile') userProfile(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) { return this.settings.updateProfile(u, dto); }
  @Patch('settings/notifications') prefs(@CurrentUser() u: AuthUser, @Body() dto: NotificationPrefsDto) { return this.settings.updatePrefs(u, dto); }
}
