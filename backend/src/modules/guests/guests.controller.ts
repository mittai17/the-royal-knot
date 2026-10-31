import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CheckInDto, CreateGuestDto, GuestQuery, ImportGuestsDto, UpdateGuestDto } from './guests.dto';
import { GuestsService } from './guests.service';

@ApiTags('guests') @ApiCookieAuth() @Controller()
export class GuestsController {
  constructor(private svc: GuestsService) {}
  @Get('weddings/:id/guests') list(@Param('id', ParseUUIDPipe) id: string, @Query() q: GuestQuery) { return this.svc.list(id, q); }
  @Get('weddings/:id/guests/stats') stats(@Param('id', ParseUUIDPipe) id: string) { return this.svc.stats(id); }
  @Post('weddings/:id/guests') @Roles(G.ALL) create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGuestDto, @CurrentUser() u: AuthUser) { return this.svc.create(id, dto, u); }
  @Post('weddings/:id/guests/import') @Roles(G.PLANNING) @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  import(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportGuestsDto, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser) {
    const csv = file ? file.buffer.toString('utf8') : dto.csv;
    if (!csv) throw new BadRequestException('Provide a CSV file (field "file") or a "csv" string');
    return this.svc.importCsv(id, csv, u);
  }
  @Patch('guests/:id') @Roles(G.ALL) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGuestDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Delete('guests/:id') @Roles(G.PLANNING) remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.remove(id, u); }
  @Post('guests/:id/checkin') @Roles(G.ALL) checkIn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckInDto, @CurrentUser() u: AuthUser) { return this.svc.checkIn(id, dto, u); }
}
