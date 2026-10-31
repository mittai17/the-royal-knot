import { ApprovalState, ApprovalType } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateApprovalDto {
  @IsEnum(ApprovalType) type: ApprovalType;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsString() @MaxLength(60) entity?: string;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
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
}
