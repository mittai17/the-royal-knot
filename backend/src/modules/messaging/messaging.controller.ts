import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role, ThreadChannel } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { MAX_UPLOAD } from '../documents/documents.service';
import { CreateThreadDto, SendMessageDto } from './messaging.dto';
import { MessagingService } from './messaging.service';

const file = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

/** Handlers shared by the staff inbox and the two portals; row scoping happens in MessagingService.threadWhere. */
abstract class ThreadRoutes {
  constructor(protected svc: MessagingService) {}
  @Get('threads') threads(@CurrentUser() u: AuthUser, @Query('channel') channel?: ThreadChannel, @Query('weddingId') weddingId?: string, @Query('search') search?: string) {
    return this.svc.listThreads(u, { channel: channel && channel in ThreadChannel ? channel : undefined, weddingId, search });
  }
  @Get('unread') unread(@CurrentUser() u: AuthUser) { return this.svc.unreadSummary(u); }
  @Get('threads/:id') thread(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getThread(u, id); }
  @Get('threads/:id/messages') messages(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('before') before?: string, @Query('take') take?: string) {
    return this.svc.messages(u, id, { before, take: take ? Number(take) : undefined });
  }
  @Post('threads/:id/messages') send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) { return this.svc.send(u, id, dto.body, dto.attachmentDocumentIds); }
  @Post('threads/:id/read') read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(u, id); }
  @Post('threads/:id/attachments') @ApiConsumes('multipart/form-data') @UseInterceptors(file())
  attach(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() f: Express.Multer.File) { return this.svc.upload(u, id, f); }
  @Get('threads/:id/attachments/:docId') download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) { return this.svc.download(u, id, docId); }
}

@ApiTags('messaging') @ApiCookieAuth() @Controller('messaging') @Roles(G.STAFF)
export class MessagingController extends ThreadRoutes {
  constructor(svc: MessagingService) { super(svc); }
  @Post('threads') create(@CurrentUser() u: AuthUser, @Body() dto: CreateThreadDto) { return this.svc.createThread(u, dto); }
}

@ApiTags('portal-client') @ApiCookieAuth() @Controller('portal/client/chat') @Roles(Role.CLIENT)
export class ClientChatController extends ThreadRoutes {
  constructor(svc: MessagingService) { super(svc); }
}

@ApiTags('portal-vendor') @ApiCookieAuth() @Controller('portal/vendor/messages') @Roles(Role.VENDOR)
export class VendorMessagesController extends ThreadRoutes {
  constructor(svc: MessagingService) { super(svc); }
}
