import { FeedbackKind, FeedbackStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsInt, Max, Min, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class SubmitFeedbackDto {
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsString() @MinLength(2) @MaxLength(160) subject: string;
  @IsString() @MinLength(2) @MaxLength(4000) body: string;
  @IsOptional() @IsEnum(FeedbackKind) kind?: FeedbackKind;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsUUID('all', { each: true }) attachmentDocumentIds?: string[];
}

export class UpdateFeedbackDto {
  @IsOptional() @IsEnum(FeedbackStatus) status?: FeedbackStatus;
  @IsOptional() @IsString() @MaxLength(4000) response?: string;
  @IsOptional() @IsUUID() assignedToId?: string;
}

export class FeedbackQuery extends PageQuery {
  @IsOptional() @IsEnum(FeedbackStatus) status?: FeedbackStatus;
  @IsOptional() @IsEnum(FeedbackKind) kind?: FeedbackKind;
  @IsOptional() @IsUUID() weddingId?: string;
}
