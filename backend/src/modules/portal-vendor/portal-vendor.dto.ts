import { DocumentCategory, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PageQuery } from '../../common/pagination';
import { QuoteItemDto } from '../quotations/quotations.dto';

export class RfqListQuery extends PageQuery {
  @IsOptional() @IsIn(['new', 'submitted', 'closed', 'all']) view?: 'new' | 'submitted' | 'closed' | 'all';
}

/** Vendor-facing quotation payload: same line-item rules as staff entry, minus `rating` (a vendor cannot rate itself). */
export class PortalQuotationDto {
  @IsOptional() @IsString() @MaxLength(1000) menu?: string;
  @IsOptional() @IsInt() @Min(0) guests?: number;
  @IsOptional() @IsInt() @Min(0) guestCapacity?: number;
  @IsOptional() @IsNumber() @Min(0) ratePerPlate?: number;
  @IsOptional() @IsNumber() @Min(0) extraHourCharge?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuoteItemDto) items: QuoteItemDto[];
}

export class UpdateVendorProfileDto {
  @IsOptional() @IsString() @MaxLength(160) businessName?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) serviceAreas?: string[];
  @IsOptional() @IsNumber() @Min(0) basePrice?: number;
  @IsOptional() @IsString() @MaxLength(40) priceUnit?: string;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
  @IsOptional() @IsString() @MaxLength(400) bankDetails?: string;
}
export class ServiceDto {
  @IsString() @MaxLength(160) name: string;
  @IsString() @MaxLength(40) unit: string;
  @IsNumber() @Min(0) price: number;
}
export class UpdateServiceDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
}
export class AvailabilityDto {
  @IsOptional() @IsArray() @ArrayMinSize(0) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'Dates must be YYYY-MM-DD' }) blockedDates?: string[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class DeliverableDto { @IsBoolean() done: boolean; @IsOptional() @IsString() @MaxLength(500) note?: string; }
export class CheckDto { @IsOptional() @IsString() @MaxLength(500) notes?: string; }
export class RespondDto { @IsString() @MaxLength(1500) text: string; }
export class VendorTaskDto {
  @IsOptional() @IsIn([TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.BLOCKED]) status?: TaskStatus;
  @IsOptional() @IsString() @MaxLength(1000) evidenceNote?: string;
}
export const VENDOR_DOC_CATEGORIES: DocumentCategory[] = ['VENDOR_QUOTATION', 'VENDOR_CONTRACT', 'INVOICE', 'EVIDENCE', 'PHOTO', 'OTHER'];
export class UploadDocDto {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsEnum(DocumentCategory) category?: DocumentCategory;
}
