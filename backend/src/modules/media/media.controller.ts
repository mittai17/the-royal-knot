import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { MediaQuery, UploadMediaDto } from './media.dto';
import { MEDIA_MAX, MediaService } from './media.service';

const file = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MEDIA_MAX } });

@ApiTags('media') @ApiCookieAuth() @Controller('media') @Roles(G.STAFF)
export class MediaController {
  constructor(private svc: MediaService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: MediaQuery) { return this.svc.list(u, q); }
  @Post() @Roles(Role.PLANNER, Role.EVENT_MANAGER) @ApiConsumes('multipart/form-data') @UseInterceptors(file())
  upload(@CurrentUser() u: AuthUser, @Body() dto: UploadMediaDto, @UploadedFile() f: Express.Multer.File) { return this.svc.upload(u, dto, f); }
  @Get(':id/file') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.file(u, id); }
  @Patch(':id/visibility') @Roles(Role.PLANNER, Role.EVENT_MANAGER) visibility(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body('clientVisible') v: boolean) { return this.svc.setVisibility(u, id, !!v); }
  @Delete(':id') @Roles(Role.PLANNER, Role.EVENT_MANAGER) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}

@ApiTags('portal-client') @ApiCookieAuth() @Controller('portal/client/media') @Roles(Role.CLIENT)
export class ClientMediaController {
  constructor(private svc: MediaService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: MediaQuery) { return this.svc.list(u, q); }
  @Post() @ApiConsumes('multipart/form-data') @UseInterceptors(file())
  upload(@CurrentUser() u: AuthUser, @Body() dto: UploadMediaDto, @UploadedFile() f: Express.Multer.File) { return this.svc.upload(u, dto, f); }
  @Get(':id/file') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.file(u, id); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
