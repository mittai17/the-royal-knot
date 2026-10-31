import { ThreadChannel } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsUUID('all', { each: true }) attachmentDocumentIds?: string[];
}

export class CreateThreadDto {
  @IsEnum(ThreadChannel) channel: ThreadChannel;
  @IsString() @MinLength(2) @MaxLength(160) subject: string;
  @IsOptional() @IsUUID() weddingId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) memberIds?: string[];
}
