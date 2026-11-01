import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateProposalDto, ProposalQuery, RespondProposalDto, SendProposalDto, UpdateProposalDto } from './proposals.dto';
import { ProposalsService } from './proposals.service';

/** Planner (and founder) only, per the permission matrix. */
@ApiTags('proposals') @ApiCookieAuth() @Controller('proposals') @Roles(G.CRM)
export class ProposalsController {
  constructor(private svc: ProposalsService) {}
  @Get() list(@Query() q: ProposalQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get('summary') summary() { return this.svc.summary(); }
  @Get('templates') templates() { return this.svc.templates(); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateProposalDto) { return this.svc.create(u, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProposalDto) { return this.svc.update(u, id, dto); }
  @Post(':id/send') send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendProposalDto) { return this.svc.send(u, id, dto.templateId); }
  @Post(':id/respond') respond(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondProposalDto) { return this.svc.respond(u, id, dto.status); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
