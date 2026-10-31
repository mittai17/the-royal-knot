import { PartialType } from '@nestjs/swagger';
import { Role, UserStatus } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() phone?: string;
  @IsEnum(Role) role: Role;
  @IsString() @MinLength(10) password: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() coupleId?: string;
  @IsOptional() @IsNumber() monthlyCost?: number;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsBoolean() available?: boolean;
}

export class CreateTeamDto { @IsString() name: string; }
export class AddMemberDto { @IsUUID() userId: string; }
