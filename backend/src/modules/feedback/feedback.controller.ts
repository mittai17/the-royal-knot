import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { MAX_UPLOAD } from '../documents/documents.service';
import { FeedbackQuery, SubmitFeedbackDto, UpdateFeedbackDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

const file = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

@ApiTags('feedback') @ApiCookieAuth() @Controller('feedback') @Roles(Role.PLANNER, Role.EVENT_MANAGER)
export class FeedbackController {
  constructor(private svc: FeedbackService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: FeedbackQuery) { return this.svc.list(u, q); }
  @Get('summary') summary(@CurrentUser() u: AuthUser) { return this.svc.summary(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') @Roles(Role.PLANNER) update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeedbackDto) { return this.svc.update(u, id, dto); }
  @Get(':id/attachments/:docId') download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) { return this.svc.download(u, id, docId); }
}

/** Shared by the client "Feedback & requests" and vendor "Support" portals; scoping lives in FeedbackService. */
abstract class PortalFeedback {
  constructor(protected svc: FeedbackService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: FeedbackQuery) { return this.svc.list(u, q); }
  @Get('summary') summary(@CurrentUser() u: AuthUser) { return this.svc.summary(u); }
  @Post() submit(@CurrentUser() u: AuthUser, @Body() dto: SubmitFeedbackDto) { return this.svc.submit(u, dto); }
  @Post('attachments') @ApiConsumes('multipart/form-data') @UseInterceptors(file()) attach(@CurrentUser() u: AuthUser, @UploadedFile() f: Express.Multer.File) { return this.svc.upload(u, f); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Get(':id/attachments/:docId') download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) { return this.svc.download(u, id, docId); }
}

@ApiTags('portal-client') @ApiCookieAuth() @Controller('portal/client/feedback') @Roles(Role.CLIENT)
export class ClientFeedbackController extends PortalFeedback { constructor(svc: FeedbackService) { super(svc); } }

@ApiTags('portal-vendor') @ApiCookieAuth() @Controller('portal/vendor/support') @Roles(Role.VENDOR)
export class VendorSupportController extends PortalFeedback { constructor(svc: FeedbackService) { super(svc); } }
