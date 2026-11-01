import { MilestoneType, PaymentMethod, PaymentStatus, VendorPaymentKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class RecordPaymentDto {
  @IsUUID() weddingId: string;
  @IsEnum(MilestoneType) milestone: MilestoneType;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class RecordVendorPaymentDto {
  @IsUUID() weddingVendorId: string;
  @IsEnum(VendorPaymentKind) kind: VendorPaymentKind;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class MilestoneQuery extends PageQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() withinDays?: number;
}

export class UpiQrQuery {
  @IsUUID() milestoneId: string;
}

export class PaymentListQuery extends PageQuery {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsEnum(MilestoneType) milestone?: MilestoneType;
  /** true = verified deposits only, false = received but not yet verified. */
  @IsOptional() @IsIn(['true', 'false']) verified?: string;
  /** refunds = reversal entries only, payments = originals only */
  @IsOptional() @IsIn(['refunds', 'payments']) kind?: string;
}

export class VerifyPaymentDto { @IsOptional() @IsString() @MaxLength(1000) note?: string; }

export class RefundPaymentDto {
  /** Defaults to everything still refundable on the payment. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount?: number;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

/** Gateway webhook payload. Money is verified server-side against the milestone; the gateway reference makes repeats harmless. */
export class GatewayCallbackDto {
  @IsIn(['payment.pending', 'payment.processing', 'payment.succeeded', 'payment.failed', 'payment.refunded']) event: 'payment.pending' | 'payment.processing' | 'payment.succeeded' | 'payment.failed' | 'payment.refunded';
  @IsString() @MinLength(4) @MaxLength(100) gatewayRef: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsOptional() @IsUUID() milestoneId?: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsEnum(MilestoneType) milestone?: MilestoneType;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
}
export const PROVIDER_PATTERN = /^[a-z0-9_-]{2,30}$/i;

export class MilestoneInputDto {
  @IsEnum(MilestoneType) type: MilestoneType;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) percent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
}
export class MilestonePlanDto {
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => MilestoneInputDto) milestones: MilestoneInputDto[];
}
