import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { BillNoteDto, BillQuery, CreateVendorBillDto, PayBillDto, RejectBillDto } from './vendor-bills.dto';
import { VendorBillsService } from './vendor-bills.service';

@ApiTags('vendor-bills') @ApiCookieAuth() @Controller('vendor-bills') @Roles(G.FINANCE_WRITE)
export class VendorBillsController {
  constructor(private svc: VendorBillsService) {}
  @Get() list(@Query() q: BillQuery) { return this.svc.list(q); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Post() create(@Body() dto: CreateVendorBillDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Post(':id/verify') verify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BillNoteDto, @CurrentUser() u: AuthUser) { return this.svc.verify(id, dto.note, u); }
  @Post(':id/approve') approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BillNoteDto, @CurrentUser() u: AuthUser) { return this.svc.approve(id, dto.note, u); }
  @Post(':id/reject') reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectBillDto, @CurrentUser() u: AuthUser) { return this.svc.reject(id, dto.note, u); }
  @Post(':id/pay') pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayBillDto, @CurrentUser() u: AuthUser) { return this.svc.pay(id, dto, u); }
}
