import { PartialType } from '@nestjs/swagger';
import { BookingStatus, EventKind, ExecutionStage, PackageType, WeddingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

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
  /** Legacy combined status. Mapped onto executionStage; never confirms a booking (use POST /weddings/:id/confirm). */
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
  @IsOptional() @IsEnum(BookingStatus) bookingStatus?: BookingStatus;
  @IsOptional() @IsEnum(ExecutionStage) executionStage?: ExecutionStage;
  /** Derived UI tabs: drafts | planning | in_progress | completed | cancelled | confirmed (default: all). */
  @IsOptional() @IsIn(['all', 'drafts', 'planning', 'in_progress', 'completed', 'cancelled', 'confirmed']) view?: 'all' | 'drafts' | 'planning' | 'in_progress' | 'completed' | 'cancelled' | 'confirmed';
}
