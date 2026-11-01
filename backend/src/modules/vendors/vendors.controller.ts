import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { AssignVendorDto, CreateVendorDto, UpdateVendorDto, UpdateWeddingVendorDto, VendorQuery } from './vendors.dto';
import { VendorsService } from './vendors.service';

@ApiTags('vendors') @ApiCookieAuth() @Controller()
export class VendorsController {
  constructor(private svc: VendorsService) {}
  @Get('vendors') list(@Query() q: VendorQuery) { return this.svc.list(q); }
  @Post('vendors') @Roles(G.CRM) create(@Body() dto: CreateVendorDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Get('vendors/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Patch('vendors/:id') @Roles(G.CRM) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Get('weddings/:id/vendors') forWedding(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.weddingVendors(id, u); }
  @Post('weddings/:id/vendors') @Roles(G.CRM) assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignVendorDto, @CurrentUser() u: AuthUser) { return this.svc.assign(id, dto, u); }
  @Patch('wedding-vendors/:id') @Roles(G.CRM) updateWv(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWeddingVendorDto, @CurrentUser() u: AuthUser) { return this.svc.updateWeddingVendor(id, dto, u); }
  @Delete('wedding-vendors/:id') @Roles(G.CRM) unassign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.unassign(id, u); }
}
