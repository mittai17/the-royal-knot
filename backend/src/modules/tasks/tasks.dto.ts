import { PartialType } from '@nestjs/swagger';
import { Priority, TaskCategory, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateTaskDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(TaskCategory) category: TaskCategory;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) dependsOnIds?: string[];
}

export class UpdateTaskDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsString() evidenceNote?: string;
  @IsOptional() @IsUUID() evidenceDocumentId?: string;
}

export class GenerateTasksDto { @IsOptional() @IsUUID() templateId?: string; }

export class TaskQuery extends PageQuery {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(TaskCategory) category?: TaskCategory;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() overdue?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() mine?: boolean;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class TemplateItemDto {
  @IsString() key: string;
  @IsString() name: string;
  @IsString() description: string;
  @IsEnum(TaskCategory) category: TaskCategory;
  @IsInt() offsetDays: number;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() dependsOnKey?: string;
}
export class UpdateTemplateItemDto extends PartialType(TemplateItemDto) {}
