import { PartialType } from '@nestjs/swagger';
import { VendorCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateVendorDto {
  @IsString() name: string;
  @IsOptional() @IsString() businessName?: string;
  @IsEnum(VendorCategory) category: VendorCategory;
  @IsString() contactName: string;
  @IsString() phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) serviceAreas?: string[];
  @IsOptional() @IsNumber() @Min(0) basePrice?: number;
  @IsOptional() @IsString() priceUnit?: string;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() bankDetails?: string;
}
export class UpdateVendorDto extends PartialType(CreateVendorDto) {}

export class VendorQuery extends PageQuery {
  @IsOptional() @IsEnum(VendorCategory) category?: VendorCategory;
  @IsOptional() @Type(() => Boolean) @IsBoolean() available?: boolean;
  @IsOptional() @IsString() area?: string;
}

export class AssignVendorDto {
  @IsUUID() vendorId: string;
  @IsEnum(VendorCategory) category: VendorCategory;
  @IsNumber() @Min(0) contractAmount: number;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateWeddingVendorDto {
  @IsOptional() @IsNumber() @Min(0) contractAmount?: number;
  @IsOptional() @IsNumber() @Min(0) negotiatedAmount?: number;
  @IsOptional() @IsString() notes?: string;
}
