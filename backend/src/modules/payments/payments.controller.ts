import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { GatewayCallbackDto, MilestonePlanDto, MilestoneQuery, PaymentListQuery, PROVIDER_PATTERN, RecordPaymentDto, RecordVendorPaymentDto, RefundPaymentDto, UpiQrQuery, VerifyPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments') @ApiCookieAuth() @Controller() @Roles(G.FINANCE_READ)
export class PaymentsController {
  constructor(private svc: PaymentsService) {}
  @Get('weddings/:id/payments') forWedding(@Param('id', ParseUUIDPipe) id: string) { return this.svc.forWedding(id); }
  /** Client Payments register (all rows incl. pending / failed attempts and refund entries). */
  @Get('payments') list(@Query() q: PaymentListQuery) { return this.svc.list(q); }
  @Get('payments/milestones') milestones(@Query() q: MilestoneQuery) { return this.svc.milestones(q); }
  /** UPI deep link (upi://pay?...) for a milestone's outstanding amount; render it as a QR on the client. No external call. */
  @Get('payments/upi-qr') upiQr(@Query() q: UpiQrQuery) { return this.svc.upiLink(q.milestoneId); }
  @Post('payments') @Roles(G.FINANCE_WRITE) record(@Body() dto: RecordPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.record(dto, u); }
  @Get('payments/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Get('payments/:id/receipt') receipt(@Param('id', ParseUUIDPipe) id: string) { return this.svc.receipt(id); }
  /** Confirms the funds are received (sets verifiedAt/verifiedById). Someone other than who recorded it. A verified booking deposit is what a booking confirmation reads. */
  @Post('payments/:id/verify') @Roles(G.FINANCE_WRITE) verify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.verify(id, dto.note, u); }
  /** Refund = reversal entry (never a delete). Needs Founder approval unless the Founder does it. */
  @Post('payments/:id/refund') @Roles(G.FINANCE_WRITE) refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.refund(id, dto, u); }
  @Get('weddings/:id/milestone-plan') plan(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getMilestonePlan(id); }
  /** Per-contract milestone split (percent or amount for BOOKING and ADVANCE; FINAL is the remainder). */
  @Put('weddings/:id/milestone-plan') @Roles(G.FINANCE_WRITE) setPlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MilestonePlanDto, @CurrentUser() u: AuthUser) { return this.svc.setMilestonePlan(id, dto, u); }
  /** Legacy direct vendor payment (Finance at or under the approval limit, Founder any amount). Larger amounts: POST /vendor-payments. */
  @Post('weddings/:id/vendor-payments') @Roles(G.FINANCE_WRITE) vendorPay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordVendorPaymentDto, @CurrentUser() u: AuthUser) { return this.svc.recordVendor(id, dto, u); }

  /** Payment-gateway webhook. No session: authenticated by the shared secret / HMAC signature; idempotent by gatewayRef. */
  @Public() @Post('payments/callbacks/:provider') @HttpCode(200)
  async callback(@Param('provider') provider: string, @Body() dto: GatewayCallbackDto, @Headers() headers: Record<string, string | string[] | undefined>, @Req() req: { body: unknown }) {
    if (!PROVIDER_PATTERN.test(provider)) throw new BadRequestException('Unknown provider');
    this.svc.assertCallbackAuthentic(provider, req.body, headers); // HMAC is over the original JSON body, not the validated copy
    return this.svc.gatewayCallback(provider, dto);
  }
}
