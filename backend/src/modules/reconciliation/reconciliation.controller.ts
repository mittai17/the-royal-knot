import { Body, Controller, Get, Query, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateChargeDto, InvoiceDto, QueueQuery, SettleDto, UpdateChargeDto, VoidChargeDto } from './reconciliation.dto';
import { ReconciliationQueueService } from './reconciliation-queue.service';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('reconciliation') @ApiCookieAuth() @Controller() @Roles(G.FINANCE_READ)
export class ReconciliationController {
  constructor(private svc: ReconciliationService, private queue: ReconciliationQueueService) {}
  /** Everything that does not reconcile (duplicate bill refs, qty/rate diffs, unapproved extras, overpayments, unmatched or stuck transactions). */
  @Get('reconciliation/queue') queueList(@Query() q: QueueQuery) { return this.queue.queue(q); }
  @Get('weddings/:id/reconciliation') view(@Param('id', ParseUUIDPipe) id: string) { return this.svc.view(id); }
  @Get('weddings/:id/reconciliation/statement') statement(@Param('id', ParseUUIDPipe) id: string) { return this.svc.statementPdf(id); }
  @Post('weddings/:id/reconciliation/charges') @Roles(Role.FINANCE, Role.PLANNER, Role.EVENT_MANAGER) add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateChargeDto, @CurrentUser() u: AuthUser) { return this.svc.addCharge(id, dto, u); }
  @Patch('reconciliation/charges/:id') @Roles(Role.FINANCE) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChargeDto, @CurrentUser() u: AuthUser) { return this.svc.updateCharge(id, dto, u); }
  /** Replaces DELETE: posts a counter-entry; nothing is removed. */
  @Post('reconciliation/charges/:id/void') @Roles(Role.FINANCE) voidCharge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidChargeDto, @CurrentUser() u: AuthUser) { return this.svc.voidCharge(id, dto.reason, u); }
  @Put('reconciliation/settlements/:id/invoice') @Roles(Role.FINANCE) invoice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvoiceDto, @CurrentUser() u: AuthUser) { return this.svc.setInvoice(id, dto, u); }
  @Post('reconciliation/:id/settle') @Roles(Role.FINANCE) settle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleDto, @CurrentUser() u: AuthUser) { return this.svc.settle(id, dto, u); }
}
