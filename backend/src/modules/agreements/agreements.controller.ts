import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { ClientSignDto, GenerateAgreementDto, RejectAgreementDto, SignAgreementDto } from './agreements.dto';
import { AgreementsService } from './agreements.service';

@ApiTags('agreements') @ApiCookieAuth() @Controller()
export class AgreementsController {
  constructor(private svc: AgreementsService) {}
  @Get('agreement-templates') templates() { return this.svc.templates(); }
  @Get('weddings/:id/agreements') list(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.list(id, u); }
  @Post('weddings/:id/agreements') @Roles(G.CRM) generate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateAgreementDto, @CurrentUser() u: AuthUser) { return this.svc.generate(id, dto.templateId, u); }
  @Get('agreements/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Post('agreements/:id/reject') @Roles(G.CRM) reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectAgreementDto, @CurrentUser() u: AuthUser) { return this.svc.reject(id, dto.reason, u); }
  /** Couple signing endpoints (client portal). */
  @Post('portal/client/agreements/:id/sign') @Roles(G.CLIENT_PORTAL) clientSign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClientSignDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.signAsClient(u, id, dto, req.ip); }
  @Post('portal/client/agreements/:id/reject') @Roles(G.CLIENT_PORTAL) async clientReject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectAgreementDto, @CurrentUser() u: AuthUser) { return this.svc.reject(id, dto.reason, u); }
  @Post('agreements/:id/sign') @Roles(G.CRM) sign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SignAgreementDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.sign(id, dto, u, req.ip); }
  @Post('agreements/:id/pdf') @Roles(G.CRM) store(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.storePdf(id, u); }
  @Get('agreements/:id/pdf') pdf(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.pdfStream(id, u); }
}
