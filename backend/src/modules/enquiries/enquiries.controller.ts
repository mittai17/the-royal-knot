import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { AddActivityDto, ConvertEnquiryDto, CreateEnquiryDto, EnquiryQuery, UpdateEnquiryDto } from './enquiries.dto';
import { EnquiriesService } from './enquiries.service';

@ApiTags('enquiries') @ApiCookieAuth() @Controller('enquiries')
export class EnquiriesController {
  constructor(private svc: EnquiriesService) {}
  @Get() list(@Query() q: EnquiryQuery) { return this.svc.list(q); }
  @Get('pipeline/summary') pipeline() { return this.svc.pipeline(); }
  @Post() @Roles(G.CRM) create(@Body() dto: CreateEnquiryDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Patch(':id') @Roles(G.CRM) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEnquiryDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Post(':id/activities') @Roles(G.CRM) activity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddActivityDto, @CurrentUser() u: AuthUser) { return this.svc.addActivity(id, dto.message, dto.type, u); }
  @Post(':id/convert') @Roles(G.CRM) convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertEnquiryDto, @CurrentUser() u: AuthUser) { return this.svc.convert(id, dto, u); }
}
