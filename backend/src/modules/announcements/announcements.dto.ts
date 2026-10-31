import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export const AUDIENCES = ['ALL', 'CLIENTS', 'VENDORS', 'TEAM'] as const;
export type AudienceKey = (typeof AUDIENCES)[number];

export class CreateAnnouncementDto {
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsString() @MinLength(1) @MaxLength(5000) body: string;
  @IsIn(AUDIENCES) audience: AudienceKey;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(5000) body?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class AnnouncementQuery extends PageQuery {
  @IsOptional() @IsIn(AUDIENCES) audience?: AudienceKey;
  @IsOptional() @IsUUID() weddingId?: string;
}
