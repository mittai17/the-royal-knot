import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { VendorCategory } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateRfqDto, QuotationStatusDto, RfqQuery, SelectQuotationDto, SubmitQuotationDto } from './quotations.dto';
import { QuotationsService } from './quotations.service';

@ApiTags('quotations') @ApiCookieAuth() @Controller()
export class QuotationsController {
  constructor(private svc: QuotationsService) {}
  @Post('quotations/requests') @Roles(G.CRM) create(@Body() dto: CreateRfqDto, @CurrentUser() u: AuthUser) { return this.svc.createRfq(dto, u); }
  @Post('quotations/requests/group/:rfqGroup/send') @Roles(G.CRM) send(@Param('rfqGroup', ParseUUIDPipe) g: string, @CurrentUser() u: AuthUser) { return this.svc.sendRfq(g, u); }
  @Post('quotations/requests/group/:rfqGroup/compare') @Roles(G.CRM) compare(@Param('rfqGroup', ParseUUIDPipe) g: string, @CurrentUser() u: AuthUser) { return this.svc.markCompared(g, u); }
  @Get('quotations/requests') list(@Query() q: RfqQuery, @CurrentUser() u: AuthUser) { return this.svc.listGroups(q, u); }
  @Get('quotations/requests/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.getRequest(id, u); }
  @Post('quotations/requests/:id/quotation') @Roles(G.CRM) submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitQuotationDto, @CurrentUser() u: AuthUser) { return this.svc.submit(id, dto, u); }
  @Get('weddings/:id/quotation-comparison') comparison(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Query('category') category?: VendorCategory, @Query('rfqGroup') rfq?: string) { return this.svc.comparison(id, category, rfq, u); }
  @Post('quotations/:id/select') @Roles(G.CRM) select(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SelectQuotationDto, @CurrentUser() u: AuthUser) { return this.svc.select(id, dto, u); }
  @Post('quotations/:id/status') @Roles(G.CRM) status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QuotationStatusDto, @CurrentUser() u: AuthUser) { return this.svc.setStatus(id, dto.status, u); }
  @Get('quotations/:id/pdf') pdf(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.renderPdf(id, u); }
}
