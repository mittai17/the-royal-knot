import { PartialType } from '@nestjs/swagger';
import { InvitationStatus, RSVP } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateGuestDto {
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() groupName?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(InvitationStatus) invitationStatus?: InvitationStatus;
  @IsOptional() @IsEnum(RSVP) rsvp?: RSVP;
  @IsOptional() @IsInt() @Min(0) plusOnes?: number;
  @IsOptional() @IsString() dietary?: string;
  @IsOptional() @IsBoolean() accommodationNeeded?: boolean;
}
export class UpdateGuestDto extends PartialType(CreateGuestDto) {}

export class GuestQuery extends PageQuery {
  @IsOptional() @IsEnum(RSVP) rsvp?: RSVP;
  @IsOptional() @IsEnum(InvitationStatus) invitationStatus?: InvitationStatus;
  @IsOptional() @IsString() groupName?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() checkedIn?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() accommodation?: boolean;
}

export class ImportGuestsDto { @IsOptional() @IsString() csv?: string; }
export class CheckInDto {
  @IsOptional() @IsInt() @Min(0) count?: number;
  @IsOptional() @IsBoolean() undo?: boolean;
}
