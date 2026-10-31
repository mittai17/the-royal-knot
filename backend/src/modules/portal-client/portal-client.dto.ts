import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StoryDto { @IsString() @MaxLength(4000) story: string; }
export class InviteDto {
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) guestIds?: string[];
  /** Send to every guest whose invitation has not been sent yet. */
  @IsOptional() @IsBoolean() allPending?: boolean;
}
