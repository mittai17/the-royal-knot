import { PaymentMethod, VendorBillStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateVendorBillDto {
  @IsUUID() vendorId: string;
  @IsString() @MinLength(1) @MaxLength(60) billNo: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsOptional() @IsDateString() billDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) subtotal: number;
  @Type(() => Number) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) taxTotal?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

/** Vendor-portal upload: vendorId comes from the signed-in account. Numbers arrive as strings in multipart bodies. */
export class SubmitVendorInvoiceDto {
  @IsString() @MinLength(1) @MaxLength(60) billNo: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsOptional() @IsDateString() billDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) subtotal: number;
  @Type(() => Number) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) taxTotal?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class BillNoteDto { @IsOptional() @IsString() @MaxLength(1000) note?: string; }
export class RejectBillDto { @IsString() @MinLength(3) @MaxLength(1000) note: string; }

export class PayBillDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class BillQuery extends PageQuery {
  @IsOptional() @IsEnum(VendorBillStatus) status?: VendorBillStatus;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() weddingId?: string;
}
