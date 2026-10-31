import { PartialType } from '@nestjs/swagger';
import { ArrivalStatus, IncidentStatus, Severity, TimelineStatus, WeddingStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateTimelineDto {
  @IsString() title: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsString() responsible?: string;
  @IsOptional() @IsString() team?: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateTimelineDto extends PartialType(CreateTimelineDto) {
  @IsOptional() @IsEnum(TimelineStatus) status?: TimelineStatus;
  @IsOptional() @IsDateString() actualAt?: string;
  @IsOptional() @IsInt() @Min(0) delayMinutes?: number;
}

export class ArrivalDto {
  @IsEnum(ArrivalStatus) status: ArrivalStatus;
  @IsOptional() @IsDateString() expectedAt?: string;
  @IsOptional() @IsDateString() actualAt?: string;
  @IsOptional() @IsInt() @Min(0) delayMinutes?: number;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateIncidentDto {
  @IsString() title: string;
  @IsString() description: string;
  @IsOptional() @IsEnum(Severity) severity?: Severity;
  @IsOptional() @IsUUID() assignedToId?: string;
}
export class UpdateIncidentDto {
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus;
  @IsOptional() @IsEnum(Severity) severity?: Severity;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsString() description?: string;
}

export class EventStatusDto { @IsEnum(WeddingStatus) status: WeddingStatus; }
export class ActualGuestsDto {
  @IsOptional() @IsInt() @Min(0) actualGuests?: number;
  @IsOptional() @IsBoolean() fromCheckIn?: boolean;
}
