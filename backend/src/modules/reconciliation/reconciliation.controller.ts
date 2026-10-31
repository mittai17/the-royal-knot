import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateChargeDto, InvoiceDto, SettleDto, UpdateChargeDto } from './reconciliation.dto';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('reconciliation') @ApiCookieAuth() @Controller() @Roles(G.FINANCE_READ)
export class ReconciliationController {
  constructor(private svc: ReconciliationService) {}
  @Get('weddings/:id/reconciliation') view(@Param('id', ParseUUIDPipe) id: string) { return this.svc.view(id); }
  @Get('weddings/:id/reconciliation/statement') statement(@Param('id', ParseUUIDPipe) id: string) { return this.svc.statementPdf(id); }
  @Post('weddings/:id/reconciliation/charges') @Roles(Role.FINANCE, Role.PLANNER, Role.EVENT_MANAGER) add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateChargeDto, @CurrentUser() u: AuthUser) { return this.svc.addCharge(id, dto, u); }
  @Patch('reconciliation/charges/:id') @Roles(Role.FINANCE) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChargeDto, @CurrentUser() u: AuthUser) { return this.svc.updateCharge(id, dto, u); }
  @Delete('reconciliation/charges/:id') @Roles(Role.FINANCE) del(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteCharge(id, u); }
  @Put('reconciliation/settlements/:id/invoice') @Roles(Role.FINANCE) invoice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvoiceDto, @CurrentUser() u: AuthUser) { return this.svc.setInvoice(id, dto, u); }
  @Post('reconciliation/:id/settle') @Roles(Role.FINANCE) settle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleDto, @CurrentUser() u: AuthUser) { return this.svc.settle(id, dto, u); }
}
