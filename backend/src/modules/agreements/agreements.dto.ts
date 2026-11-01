import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class GenerateAgreementDto { @IsOptional() @IsUUID() templateId?: string; }

export class SignAgreementDto {
  @IsString() @MinLength(2) signerName: string;
  @IsIn(['CLIENT', 'PLANNER']) signerRole: 'CLIENT' | 'PLANNER';
  @IsString() @MaxLength(400_000) @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: 'signatureData must be a PNG data URL' })
  signatureData: string;
}

export class RejectAgreementDto { @IsOptional() @IsString() @MaxLength(500) reason?: string; }
export class ClientSignDto {
  @IsString() @MinLength(2) signerName: string;
  @IsString() @MaxLength(400_000) @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: 'signatureData must be a PNG data URL' })
  signatureData: string;
}
