import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { ApprovalNoteDto, ApprovalQuery, CreateApprovalDto, RejectApprovalDto } from './approvals.dto';
import { ApprovalsService } from './approvals.service';

@ApiTags('approvals') @ApiCookieAuth() @Controller('approvals') @Roles(Role.PLANNER, Role.FINANCE)
export class ApprovalsController {
  constructor(private svc: ApprovalsService) {}
  @Get() list(@Query() q: ApprovalQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get('counts') counts() { return this.svc.counts(); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Post() @Roles(G.APPROVAL_REQUEST) create(@Body() dto: CreateApprovalDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  /** Mark as in review with a comment (Founder or Finance). */
  @Post(':id/review') @Roles(Role.FINANCE) review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApprovalNoteDto, @CurrentUser() u: AuthUser) { return this.svc.review(id, dto.note, u); }
  @Post(':id/approve') @Roles(G.APPROVERS) approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApprovalNoteDto, @CurrentUser() u: AuthUser) { return this.svc.decide(id, 'APPROVED', dto.note, u); }
  @Post(':id/reject') @Roles(G.APPROVERS) reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectApprovalDto, @CurrentUser() u: AuthUser) { return this.svc.decide(id, 'REJECTED', dto.note, u); }
  @Post(':id/cancel') @Roles(G.APPROVAL_REQUEST) cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.cancel(id, u); }
}
