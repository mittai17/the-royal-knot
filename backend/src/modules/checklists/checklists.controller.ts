import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { ChecklistQuery, ClientTickDto, CreateChecklistDto, CreateItemDto, CreateReportDto, ReportQuery, UpdateChecklistDto, UpdateItemDto } from './checklists.dto';
import { ChecklistsService } from './checklists.service';

const UPDATES_READ = [Role.OPERATIONS, Role.EVENT_MANAGER, Role.PLANNER];
const UPDATES_WRITE = [Role.OPERATIONS];

@ApiTags('checklists') @ApiCookieAuth() @Controller('checklists') @Roles(G.EVENT_OPS)
export class ChecklistsController {
  constructor(private svc: ChecklistsService) {}

  // Updates & Reports. Declared before ":id" so the static path wins.
  @Get('updates') @Roles(UPDATES_READ) reports(@Query() q: ReportQuery, @CurrentUser() u: AuthUser) { return this.svc.reports(q, u); }
  @Get('updates/summary') @Roles(UPDATES_READ) summary(@CurrentUser() u: AuthUser) { return this.svc.reportSummary(u); }
  @Post('updates') @Roles(UPDATES_WRITE) createReport(@Body() dto: CreateReportDto, @CurrentUser() u: AuthUser) { return this.svc.createReport(dto, u); }
  @Post('updates/photos') @Roles(UPDATES_WRITE) @ApiConsumes('multipart/form-data') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  photo(@UploadedFile() file: Express.Multer.File, @Body() body: { weddingId?: string }, @CurrentUser() u: AuthUser) {
    if (!body.weddingId) throw new BadRequestException('weddingId is required');
    return this.svc.uploadPhoto(body.weddingId, file, u);
  }

  @Get() list(@Query() q: ChecklistQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Post() create(@Body() dto: CreateChecklistDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Patch('items/:itemId') updateItem(@Param('itemId', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto, @CurrentUser() u: AuthUser) { return this.svc.updateItem(id, dto, u); }
  @Delete('items/:itemId') removeItem(@Param('itemId', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.removeItem(id, u); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChecklistDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.remove(id, u); }
  @Post(':id/items') addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateItemDto, @CurrentUser() u: AuthUser) { return this.svc.addItem(id, dto, u); }
}

@ApiTags('client portal') @ApiCookieAuth() @Controller('portal/client/checklists') @Roles(G.CLIENT_PORTAL)
export class ClientChecklistsController {
  constructor(private svc: ChecklistsService) {}
  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.forClient(u); }
  @Patch('items/:itemId') tick(@Param('itemId', ParseUUIDPipe) id: string, @Body() dto: ClientTickDto, @CurrentUser() u: AuthUser) { return this.svc.clientTick(id, dto.done, u); }
}
