import { MilestoneType, PaymentMethod, VendorPaymentKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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
