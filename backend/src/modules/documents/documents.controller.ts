import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DocumentCategory, Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { PageQuery } from '../../common/pagination';
import { DocumentsService, MAX_UPLOAD } from './documents.service';

@ApiTags('documents') @ApiCookieAuth() @Controller('documents')
export class DocumentsController {
  constructor(private svc: DocumentsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: PageQuery, @Query('weddingId') weddingId?: string, @Query('category') category?: DocumentCategory) {
    return this.svc.list(u, q, { weddingId, category });
  }

  @Post() @Roles(G.DOCS_WRITE) @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() body: { weddingId?: string; category?: DocumentCategory; documentKey?: string; roles?: string }) {
    if (!file) throw new BadRequestException('file is required');
    const allowedRoles = body.roles ? (body.roles.split(',').filter((r) => r in Role) as Role[]) : [];
    return this.svc.save({ weddingId: body.weddingId || null, name: file.originalname, category: body.category ?? DocumentCategory.OTHER, buffer: file.buffer, mime: file.mimetype, uploadedById: u.id, documentKey: body.documentKey, allowedRoles });
  }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Get(':id/versions') versions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.versions(u, id); }

  @Get(':id/download') async download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { doc, stream } = await this.svc.stream(u, id);
    return new StreamableFile(stream, { type: doc.mimeType, disposition: `attachment; filename="${encodeURIComponent(doc.name)}"` });
  }
  @Get(':id/preview') async preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { doc, stream } = await this.svc.stream(u, id);
    return new StreamableFile(stream, { type: doc.mimeType, disposition: `inline; filename="${encodeURIComponent(doc.name)}"` });
  }

  @Delete(':id') @Roles(Role.PLANNER, Role.FINANCE) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
