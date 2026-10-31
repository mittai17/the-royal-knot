import { PartialType } from '@nestjs/swagger';
import { EnquirySource, EnquiryStage, PackageType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateEnquiryDto {
  @IsString() brideName: string;
  @IsString() groomName: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsEnum(EnquirySource) source: EnquirySource;
  @IsOptional() @IsDateString() preferredDate?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsInt() @Min(0) guestCount?: number;
  @IsOptional() @IsNumber() @Min(0) budget?: number;
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsEnum(PackageType) packageType?: PackageType;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateEnquiryDto extends PartialType(CreateEnquiryDto) {
  @IsOptional() @IsEnum(EnquiryStage) stage?: EnquiryStage;
  @IsOptional() @IsString() lostReason?: string;
}

export class EnquiryQuery extends PageQuery {
  @IsOptional() @IsEnum(EnquiryStage) stage?: EnquiryStage;
  @IsOptional() @IsEnum(EnquirySource) source?: EnquirySource;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() followUpDue?: boolean;
}

export class AddActivityDto { @IsString() message: string; @IsOptional() @IsString() type?: string; }

export class ConvertEnquiryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsInt() @Min(1) eventDays?: number;
  @IsOptional() @IsInt() @Min(0) expectedGuests?: number;
  @IsOptional() @IsNumber() @Min(0) contractValue?: number;
  @IsOptional() @IsUUID() plannerId?: string;
}
