import { PartialType } from '@nestjs/swagger';
import { ApprovalStatus, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { MaxLength, MinLength, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateExpenseDto {
  @IsUUID() weddingId: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsString() category: string;
  @IsString() description: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsDateString() date: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsUUID() receiptDocumentId?: string;
  @IsOptional() @IsUUID() responsibleId?: string;
  @IsOptional() @IsBoolean() isTeamCost?: boolean;
}
export class VoidExpenseDto { @IsString() @MinLength(3) @MaxLength(500) reason: string; }
export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}
export class DecideExpenseDto { @IsEnum(ApprovalStatus) status: ApprovalStatus; }

export class ExpenseQuery extends PageQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsEnum(ApprovalStatus) status?: ApprovalStatus;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsUUID() vendorId?: string;
}

class BudgetLineDto { @IsString() category: string; @IsNumber() @Min(0) plannedAmount: number; }
export class SetBudgetDto { @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BudgetLineDto) lines: BudgetLineDto[]; }
