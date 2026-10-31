import { ClientInvoiceStatus, MilestoneType, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class InvoiceLineDto {
  @IsString() @MinLength(1) @MaxLength(300) description: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() quantity: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) taxRate?: number;
}

export class CreateInvoiceDto {
  @IsUUID() weddingId: string;
  @IsOptional() @IsUUID() milestoneId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto) lines: InvoiceLineDto[];
}

export class UpdateInvoiceDto {
  @IsOptional() @IsUUID() milestoneId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto) lines?: InvoiceLineDto[];
}

export class InvoicePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  /** Required when the invoice is not linked to a payment milestone. */
  @IsOptional() @IsEnum(MilestoneType) milestone?: MilestoneType;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class InvoiceQuery extends PageQuery {
  @IsOptional() @IsEnum(ClientInvoiceStatus) status?: ClientInvoiceStatus;
  @IsOptional() @IsUUID() weddingId?: string;
}
