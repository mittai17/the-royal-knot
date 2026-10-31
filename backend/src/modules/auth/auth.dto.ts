import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(128) password: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'Password needs upper, lower case letters and a digit' })
  newPassword: string;
}

export class KeycloakLoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(128) password: string;
}
