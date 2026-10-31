import { PartialType } from '@nestjs/swagger';
import { EventKind, IncidentStatus, Severity } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export const FUNCTION_STATUSES = ['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type FunctionStatus = (typeof FUNCTION_STATUSES)[number];

/** Day window helpers: `date` is a YYYY-MM-DD calendar day in the caller's timezone, `tz` the caller's UTC offset in minutes (e.g. 330). */
export class DayQuery {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @Type(() => Number) @IsInt() tz?: number;
}

export class CreateFunctionDto {
  @IsUUID() weddingId: string;
  @IsEnum(EventKind) kind: EventKind;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  /** Start of the function (date and time). */
  @IsDateString() date: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() @MaxLength(200) venue?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedGuests?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(FUNCTION_STATUSES) status?: FunctionStatus;
  /** WeddingVendor ids assigned to this function. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) vendorIds?: string[];
}
export class UpdateFunctionDto extends PartialType(CreateFunctionDto) {}

export class FunctionQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(FUNCTION_STATUSES) status?: FunctionStatus;
  @IsOptional() @IsString() search?: string;
}

export class ArrivalQuery extends DayQuery {
  @IsOptional() @IsUUID() weddingId?: string;
}
export class NotifyVendorDto { @IsOptional() @IsString() @MaxLength(300) message?: string; }

export class IncidentQuery extends PageQuery {
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus;
  @IsOptional() @IsEnum(Severity) severity?: Severity;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() mine?: boolean;
}

export class CalendarQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() mine?: boolean;
}
