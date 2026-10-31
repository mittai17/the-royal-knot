import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class BudgetItemDto {
  @IsString() @MaxLength(80) category: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) plannedAmount: number;
}

export class CreateBudgetDto {
  @IsUUID() weddingId: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BudgetItemDto) items: BudgetItemDto[];
}

export class UpdateBudgetDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BudgetItemDto) items?: BudgetItemDto[];
}

export class ScopeQuery {
  @IsOptional() @IsUUID() weddingId?: string;
}

export class CashFlowQuery extends ScopeQuery {
  /** Months of history and of forecast either side of the current month. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) back?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) ahead?: number;
}

export class ReportQuery {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() format?: 'json' | 'csv';
}
