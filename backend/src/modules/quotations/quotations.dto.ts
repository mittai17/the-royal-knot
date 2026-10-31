import { RequestStatus, VendorCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateRfqDto {
  @IsUUID() weddingId: string;
  @IsEnum(VendorCategory) category: VendorCategory;
  @IsString() title: string;
  @IsOptional() @IsString() brief?: string;
  @IsArray() @ArrayMinSize(3, { message: 'Request quotations from at least three vendors' }) @IsUUID('all', { each: true }) vendorIds: string[];
}

export class QuoteItemDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) quantity: number;
  @IsString() unit: string;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsNumber() @Min(0) additionalCharge?: number;
  @IsOptional() @IsBoolean() included?: boolean;
}

export class SubmitQuotationDto {
  @IsOptional() @IsString() menu?: string;
  @IsOptional() @IsInt() @Min(0) guests?: number;
  @IsOptional() @IsInt() @Min(0) guestCapacity?: number;
  @IsOptional() @IsNumber() @Min(0) ratePerPlate?: number;
  @IsOptional() @IsNumber() @Min(0) extraHourCharge?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuoteItemDto) items: QuoteItemDto[];
}

export class SelectQuotationDto { @IsOptional() @IsString() note?: string; }

export class RfqQuery extends PageQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsEnum(VendorCategory) category?: VendorCategory;
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
}
