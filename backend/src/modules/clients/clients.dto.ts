import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateClientDto {
  @IsString() @MinLength(1) @MaxLength(80) brideName: string;
  @IsString() @MinLength(1) @MaxLength(80) groomName: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}
export class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) brideName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) groomName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}
export class ClientQuery extends PageQuery {}
