import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateInvoiceDto, InvoicePaymentDto, InvoiceQuery, UpdateInvoiceDto } from './invoices.dto';
import { InvoicesService } from './invoices.service';

class VoidDto { @IsOptional() @IsString() @MaxLength(500) reason?: string; }

@ApiTags('invoices') @ApiCookieAuth() @Controller('invoices') @Roles(Role.FINANCE, Role.PLANNER)
export class InvoicesController {
  constructor(private svc: InvoicesService) {}
  @Get() list(@Query() q: InvoiceQuery) { return this.svc.list(q); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Get(':id/pdf') pdf(@Param('id', ParseUUIDPipe) id: string) { return this.svc.renderPdf(id); }
  @Post() @Roles(G.FINANCE_WRITE) create(@Body() dto: CreateInvoiceDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Patch(':id') @Roles(G.FINANCE_WRITE) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Post(':id/send') @Roles(G.FINANCE_WRITE) send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.send(id, u); }
  @Post(':id/remind') @Roles(G.FINANCE_WRITE) remind(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.remind(id, u); }
  @Post(':id/payments') @Roles(G.FINANCE_WRITE) pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvoicePaymentDto, @CurrentUser() u: AuthUser) { return this.svc.recordPayment(id, dto, u); }
  @Post(':id/void') @Roles(G.FINANCE_WRITE) void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidDto, @CurrentUser() u: AuthUser) { return this.svc.void(id, dto.reason, u); }
}
