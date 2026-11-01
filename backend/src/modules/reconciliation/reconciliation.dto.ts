import { ChargeType, PaymentMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChargeDto {
  @IsOptional() @IsUUID() weddingVendorId?: string;
  @IsEnum(ChargeType) type: ChargeType;
  @IsString() description: string;
  @IsNumber() @IsPositive() quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsBoolean() billToClient?: boolean;
}
export class UpdateChargeDto {
  @IsOptional() @IsBoolean() approved?: boolean;
  @IsOptional() @IsBoolean() billToClient?: boolean;
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() description?: string;
}
export class InvoiceDto { @IsNumber() @Min(0) actualInvoice: number; @IsOptional() @IsString() invoiceRef?: string; }
export class SettleDto {
  @IsOptional() @IsUUID() weddingVendorId?: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class VoidChargeDto { @IsString() @MinLength(3) @MaxLength(500) reason: string; }
export class QueueQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() severity?: string;
}
