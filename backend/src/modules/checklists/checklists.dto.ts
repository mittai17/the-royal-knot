import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ChecklistItemInput {
  @IsString() @MinLength(1) @MaxLength(300) title: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
export class CreateChecklistDto {
  @IsString() @MinLength(1) @MaxLength(160) name: string;
  @IsOptional() @IsUUID() weddingId?: string;
  /** Convention: checklists for one function are named "[Function] ...". */
  @IsOptional() @IsBoolean() clientVisible?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ChecklistItemInput) items?: ChecklistItemInput[];
}
export class UpdateChecklistDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsBoolean() clientVisible?: boolean;
}
export class CreateItemDto extends ChecklistItemInput {}
export class UpdateItemDto extends PartialType(ChecklistItemInput) {
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}
export class ClientTickDto { @IsBoolean() done: boolean; }
export class ChecklistQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() clientVisible?: boolean;
  @IsOptional() @IsString() search?: string;
}

export const UPDATE_TYPES = ['DAILY', 'TASK', 'EVENT'] as const;
export type UpdateType = (typeof UPDATE_TYPES)[number];
/** Daily progress update, task report or event report. Stored in the audit log (entity "FieldReport") until a dedicated table exists. */
export class CreateReportDto {
  @IsIn(UPDATE_TYPES) type: UpdateType;
  @IsUUID() weddingId: string;
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsString() @MinLength(2) @MaxLength(4000) summary: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @IsOptional() @IsString() @MaxLength(2000) issues?: string;
  @IsOptional() @IsString() @MaxLength(2000) nextSteps?: string;
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsUUID() functionId?: string;
  @IsOptional() @IsInt() @Min(0) attendance?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) photoIds?: string[];
  @IsOptional() @IsObject() extra?: Record<string, unknown>;
}
export class ReportQuery {
  @IsOptional() @IsIn(UPDATE_TYPES) type?: UpdateType;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() mine?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
