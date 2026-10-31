import { PartialType } from '@nestjs/swagger';
import { GuestTransportStatus, TripStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsString() @MaxLength(20) plate: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(80) capacity?: number;
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class CreateDriverDto {
  @IsString() @MaxLength(120) name: string;
  @IsString() @MaxLength(30) phone: string;
  @IsOptional() @IsString() licenseNo?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class CreateTripDto {
  @IsUUID() weddingId: string;
  @IsString() @MaxLength(160) title: string;
  @IsString() origin: string;
  @IsString() destination: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateTripDto extends PartialType(CreateTripDto) {}
export class TripStatusDto { @IsEnum(TripStatus) status: TripStatus; }
export class TripQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsEnum(TripStatus) status?: TripStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
}

export class CreateGuestTransportDto {
  @IsUUID() guestId: string;
  @IsOptional() @IsIn(['PICKUP', 'DROP']) kind?: 'PICKUP' | 'DROP';
  @IsOptional() @IsString() flightOrTrain?: string;
  @IsOptional() @IsDateString() arrivalAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) passengers?: number;
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateGuestTransportDto {
  @IsOptional() @IsIn(['PICKUP', 'DROP']) kind?: 'PICKUP' | 'DROP';
  @IsOptional() @IsString() flightOrTrain?: string;
  @IsOptional() @IsDateString() arrivalAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) passengers?: number;
  /** Pass null to unassign. */
  @IsOptional() @IsUUID() tripId?: string | null;
  @IsOptional() @IsEnum(GuestTransportStatus) status?: GuestTransportStatus;
  @IsOptional() @IsString() notes?: string;
}
export class GuestTransportQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsIn(['PICKUP', 'DROP']) kind?: 'PICKUP' | 'DROP';
  @IsOptional() @IsEnum(GuestTransportStatus) status?: GuestTransportStatus;
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() unassigned?: boolean;
}
export class TransportStatsQuery { @IsOptional() @IsUUID() weddingId?: string; }
