import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { VendorCategory } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateRfqDto, RfqQuery, SelectQuotationDto, SubmitQuotationDto } from './quotations.dto';
import { QuotationsService } from './quotations.service';

@ApiTags('quotations') @ApiCookieAuth() @Controller()
export class QuotationsController {
  constructor(private svc: QuotationsService) {}
  @Post('quotations/requests') @Roles(G.CRM) create(@Body() dto: CreateRfqDto, @CurrentUser() u: AuthUser) { return this.svc.createRfq(dto, u); }
  @Get('quotations/requests') list(@Query() q: RfqQuery) { return this.svc.listGroups(q); }
  @Get('quotations/requests/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getRequest(id); }
  @Post('quotations/requests/:id/quotation') @Roles(G.CRM) submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitQuotationDto, @CurrentUser() u: AuthUser) { return this.svc.submit(id, dto, u); }
  @Get('weddings/:id/quotation-comparison') comparison(@Param('id', ParseUUIDPipe) id: string, @Query('category') category?: VendorCategory, @Query('rfqGroup') rfq?: string) { return this.svc.comparison(id, category, rfq); }
  @Post('quotations/:id/select') @Roles(G.CRM) select(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SelectQuotationDto, @CurrentUser() u: AuthUser) { return this.svc.select(id, dto, u); }
  @Get('quotations/:id/pdf') pdf(@Param('id', ParseUUIDPipe) id: string) { return this.svc.renderPdf(id); }
}
