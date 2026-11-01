import { ApprovalState, ApprovalType } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

/** Where an approval request comes from. Maps to the ApprovalType enum + sourceModule; the three that have no enum value yet use OTHER (see docs/SCHEMA_REQUESTS.md, WP3). */
export const APPROVAL_SOURCES = ['expense', 'vendor-payment', 'client-discount', 'budget-increase', 'client-refund', 'cancellation', 'special-purchase', 'vendor-contract', 'other'] as const;
export type ApprovalSource = (typeof APPROVAL_SOURCES)[number];

export class CreateApprovalDto {
  /** Either `source` (preferred) or `type` must be given; `source` wins and also fills sourceModule/entity. */
  @IsOptional() @IsIn(APPROVAL_SOURCES as unknown as string[]) source?: ApprovalSource;
  @IsOptional() @IsEnum(ApprovalType) type?: ApprovalType;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsString() @MaxLength(60) entity?: string;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
  /** Justification entered by the requester. */
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsUUID() supportingDocumentId?: string;
  /** Expected decider; defaults to the Founder. */
  @IsOptional() @IsUUID() assignedApproverId?: string;
}

export class ApprovalNoteDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class RejectApprovalDto {
  @IsString() @MinLength(3, { message: 'A reason is required when rejecting' }) @MaxLength(2000) note: string;
}

export class ApprovalQuery extends PageQuery {
  /** pending = PENDING + IN_REVIEW, approved, rejected, history = everything decided or cancelled, all */
  @IsOptional() @IsIn(['pending', 'approved', 'rejected', 'history', 'all']) tab?: 'pending' | 'approved' | 'rejected' | 'history' | 'all';
  @IsOptional() @IsEnum(ApprovalType) type?: ApprovalType;
  @IsOptional() @IsEnum(ApprovalState) status?: ApprovalState;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsString() sourceModule?: string;
  /** Only requests assigned to the caller / raised by the caller. */
  @IsOptional() @IsIn(['true', 'false']) assignedToMe?: string;
  @IsOptional() @IsIn(['true', 'false']) requestedByMe?: string;
}
