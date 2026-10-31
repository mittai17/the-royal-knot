import { PurchaseOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class PoLineDto {
  @IsString() @MaxLength(300) description: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() quantity: number;
  @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) taxRate?: number;
}

/** Either `quotationId` (lines copied from the selected quotation) or `weddingId` + `vendorId` + `lines`. */
export class CreatePoDto {
  @IsOptional() @IsUUID() quotationId?: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsString() @MaxLength(3000) terms?: string;
  @IsOptional() @IsDateString() expectedBy?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PoLineDto) lines?: PoLineDto[];
}

export class UpdatePoDto {
  @IsOptional() @IsString() @MaxLength(3000) terms?: string;
  @IsOptional() @IsDateString() expectedBy?: string;
}

export class PoQuery extends PageQuery {
  @IsOptional() @IsEnum(PurchaseOrderStatus) status?: PurchaseOrderStatus;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
}
