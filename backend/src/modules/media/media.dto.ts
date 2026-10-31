import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export const ALBUMS = ['gallery', 'vendor', 'design-ideas'] as const;
export type Album = (typeof ALBUMS)[number];

export class MediaQuery extends PageQuery {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsIn(ALBUMS) album?: Album;
}

export class UploadMediaDto {
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsIn(ALBUMS) album?: Album;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() clientVisible?: boolean;
}
