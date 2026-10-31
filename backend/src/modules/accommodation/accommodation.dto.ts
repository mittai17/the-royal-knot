import { PartialType } from '@nestjs/swagger';
import { RoomAllocationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateHotelDto {
  @IsString() @MaxLength(160) name: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) starRating?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateHotelDto extends PartialType(CreateHotelDto) {}

export class CreateRoomDto {
  @IsString() @MaxLength(20) number: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) capacity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateRoomDto extends PartialType(CreateRoomDto) {}
/** Bulk add: rooms prefix+from .. prefix+to. */
export class BulkRoomsDto {
  @IsOptional() @IsString() prefix?: string;
  @Type(() => Number) @IsInt() @Min(0) from: number;
  @Type(() => Number) @IsInt() @Min(0) to: number;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) capacity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
}

export class AllocateDto {
  @IsUUID() weddingId: string;
  @IsUUID() roomId: string;
  /** One allocation per guest, e.g. a whole family sharing a room. Omit for an unassigned (block) reservation. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) guestIds?: string[];
  @IsDateString() checkIn: string;
  @IsDateString() checkOut: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateAllocationDto {
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @IsString() notes?: string;
}
export class AllocationQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() hotelId?: string;
  @IsOptional() @IsEnum(RoomAllocationStatus) status?: RoomAllocationStatus;
  @IsOptional() @IsString() search?: string;
}
export class AccommodationStatsQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() hotelId?: string;
}
export class RoomQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
