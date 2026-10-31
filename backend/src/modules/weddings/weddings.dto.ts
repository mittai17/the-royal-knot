import { PartialType } from '@nestjs/swagger';
import { EventKind, PackageType, WeddingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class EventInputDto {
  @IsEnum(EventKind) kind: EventKind;
  @IsOptional() @IsString() name?: string;
  @IsDateString() date: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsInt() @Min(0) expectedGuests?: number;
}

export class CreateWeddingDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() coupleId?: string;
  @IsOptional() @IsString() brideName?: string;
  @IsOptional() @IsString() groomName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() location: string;
  @IsOptional() @IsString() venue?: string;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsInt() @Min(1) eventDays?: number;
  @IsInt() @Min(0) expectedGuests: number;
  @IsEnum(PackageType) packageType: PackageType;
  @IsNumber() @Min(0) budget: number;
  @IsNumber() @Min(0) contractValue: number;
  @IsOptional() @IsUUID() plannerId?: string;
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EventInputDto) events?: EventInputDto[];
}

export class UpdateWeddingDto extends PartialType(CreateWeddingDto) {
  @IsOptional() @IsEnum(WeddingStatus) status?: WeddingStatus;
  @IsOptional() @IsInt() @Min(0) actualGuests?: number;
}

export class WeddingQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize: number = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() order: 'asc' | 'desc' = 'asc';
  @IsOptional() @IsEnum(WeddingStatus) status?: WeddingStatus;
  @IsOptional() @IsEnum(PackageType) packageType?: PackageType;
  @IsOptional() @IsUUID() plannerId?: string;
  @IsOptional() @IsString() location?: string;
}
