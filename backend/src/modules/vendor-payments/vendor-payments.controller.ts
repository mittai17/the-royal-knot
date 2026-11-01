import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateVendorPaymentDto, ExecuteVendorPaymentDto, ScheduleVendorPaymentDto, VendorPaymentNoteDto, VendorPaymentQuery, VendorPaymentReasonDto } from './vendor-payments.dto';
import { VendorPaymentsService } from './vendor-payments.service';

/**
 * Vendor Payments (settlement of vendor money). FINANCE creates, schedules and executes; FOUNDER approves (Finance may approve at or under the
 * approval limit, never their own); PLANNER may only propose (create) and sees only their own; EVENT_MANAGER / OPERATIONS / SYSADMIN have no access.
 */
@ApiTags('vendor-payments') @ApiCookieAuth() @Controller('vendor-payments') @Roles(G.FINANCE_READ)
export class VendorPaymentsController {
  constructor(private svc: VendorPaymentsService) {}
  @Get() list(@Query() q: VendorPaymentQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get('summary') summary(@CurrentUser() u: AuthUser) { return this.svc.summary(u); }
  /** Vendor portal: the signed-in vendor's own scheduled / processing / paid payments. */
  @Get('mine') @Roles(Role.VENDOR) mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Get(':id/history') history(@Param('id', ParseUUIDPipe) id: string) { return this.svc.history(id); }

  @Post() @Roles(Role.FINANCE, Role.PLANNER) create(@Body() dto: CreateVendorPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.createRequest(dto, u); }
  @Post(':id/approve') @Roles(G.FINANCE_WRITE) approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorPaymentNoteDto, @CurrentUser() u: AuthUser) { return this.svc.approve(id, dto.note, u); }
  @Post(':id/reject') @Roles(G.FINANCE_WRITE) reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorPaymentReasonDto, @CurrentUser() u: AuthUser) { return this.svc.reject(id, dto.reason, u); }
  @Post(':id/schedule') @Roles(G.FINANCE_WRITE) schedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleVendorPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.schedule(id, dto.scheduledFor, u); }
  @Post(':id/process') @Roles(G.FINANCE_WRITE) process(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.process(id, u); }
  @Post(':id/execute') @Roles(G.FINANCE_WRITE) execute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExecuteVendorPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.execute(id, dto, u); }
  @Post(':id/fail') @Roles(G.FINANCE_WRITE) fail(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorPaymentReasonDto, @CurrentUser() u: AuthUser) { return this.svc.fail(id, dto.reason, u); }
  @Post(':id/retry') @Roles(G.FINANCE_WRITE) retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.retry(id, u); }
  @Post(':id/cancel') @Roles(Role.FINANCE, Role.PLANNER) cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorPaymentReasonDto, @CurrentUser() u: AuthUser) { return this.svc.cancel(id, dto.reason, u); }
  /** Takes an executed payment back with a reversal entry (Founder only). */
  @Post(':id/reverse') @Roles(Role.FOUNDER) reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorPaymentReasonDto, @CurrentUser() u: AuthUser) { return this.svc.reverse(id, dto.reason, u); }
}
