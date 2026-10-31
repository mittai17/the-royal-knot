import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { MilestoneQuery, RecordPaymentDto, RecordVendorPaymentDto, UpiQrQuery } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments') @ApiCookieAuth() @Controller() @Roles(G.FINANCE_READ)
export class PaymentsController {
  constructor(private svc: PaymentsService) {}
  @Get('weddings/:id/payments') forWedding(@Param('id', ParseUUIDPipe) id: string) { return this.svc.forWedding(id); }
  @Get('payments/milestones') milestones(@Query() q: MilestoneQuery) { return this.svc.milestones(q); }
  /** UPI deep link (upi://pay?...) for a milestone's outstanding amount; render it as a QR on the client. No external call. */
  @Get('payments/upi-qr') upiQr(@Query() q: UpiQrQuery) { return this.svc.upiLink(q.milestoneId); }
  @Post('payments') @Roles(G.FINANCE_WRITE) record(@Body() dto: RecordPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.record(dto, u); }
  @Get('payments/:id/receipt') receipt(@Param('id', ParseUUIDPipe) id: string) { return this.svc.receipt(id); }
  @Post('weddings/:id/vendor-payments') @Roles(G.FINANCE_WRITE) vendorPay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordVendorPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.recordVendor(id, dto, u); }
}
