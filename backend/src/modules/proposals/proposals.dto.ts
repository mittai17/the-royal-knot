import { ProposalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateProposalDto {
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() enquiryId?: string;
  @IsOptional() @IsString() @MaxLength(120) packageName?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(20000) content?: string;
  @IsOptional() @IsDateString() validUntil?: string;
}

export class UpdateProposalDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) title?: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsString() @MaxLength(120) packageName?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(20000) content?: string;
  @IsOptional() @IsDateString() validUntil?: string;
}

export class SendProposalDto { @IsOptional() @IsUUID() templateId?: string; }
export class RespondProposalDto { @IsIn(['ACCEPTED', 'DECLINED']) status: 'ACCEPTED' | 'DECLINED'; }

export class ProposalQuery extends PageQuery {
  @IsOptional() @IsEnum(ProposalStatus) status?: ProposalStatus;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() enquiryId?: string;
}
