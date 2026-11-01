import { PaymentMethod, VendorPaymentKind, VendorPaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

/** Request a vendor payment. Point it at a bill (settlement), a purchase order (advance) or a booked vendor (advance / final). */
export class CreateVendorPaymentDto {
  @IsOptional() @IsUUID() billId?: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsOptional() @IsUUID() weddingVendorId?: string;
  /** Defaults to FINAL when the amount clears the bill / vendor balance, ADVANCE otherwise. */
  @IsOptional() @IsEnum(VendorPaymentKind) kind?: VendorPaymentKind;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsDateString() scheduledFor?: string;
  /** Why this payment is needed (shown to the approver). */
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class VendorPaymentNoteDto { @IsOptional() @IsString() @MaxLength(1000) note?: string; }
export class ScheduleVendorPaymentDto { @IsDateString() scheduledFor: string; @IsOptional() @IsString() @MaxLength(1000) note?: string; }
export class ExecuteVendorPaymentDto {
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
}
export class VendorPaymentReasonDto { @IsString() @MinLength(3) @MaxLength(1000) reason: string; }

export class VendorPaymentQuery extends PageQuery {
  @IsOptional() @IsEnum(VendorPaymentStatus) status?: VendorPaymentStatus;
  /** requests, approvals (awaiting a decision), advances, scheduled, settlements (FINAL), history (done / failed / cancelled), failed */
  @IsOptional() @IsIn(['requests', 'approvals', 'advances', 'scheduled', 'settlements', 'history', 'failed', 'all']) tab?: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() billId?: string;
}
