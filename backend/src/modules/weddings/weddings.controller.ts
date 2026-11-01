import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { EventKind, Role, WeddingStatus } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { ScopeService } from '../../common/scope.service';
import { CreateWeddingDto, UpdateWeddingDto, WeddingQuery } from './weddings.dto';
import { WeddingsService } from './weddings.service';

class AddEventDto {
  @IsEnum(EventKind) kind: EventKind;
  @IsOptional() @IsString() name?: string;
  @IsDateString() date: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsInt() @Min(0) expectedGuests?: number;
}
class StatusDto { @IsEnum(WeddingStatus) status: WeddingStatus; }
class AssignDto { @IsUUID() userId: string; }

@ApiTags('weddings') @ApiCookieAuth() @Controller()
export class WeddingsController {
  constructor(private svc: WeddingsService, private scope: ScopeService) {}

  @Get('weddings') @Roles(G.EVERYONE.filter((r) => r !== Role.SYSADMIN)) list(@Query() q: WeddingQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Post('weddings') @Roles(G.CRM) create(@Body() dto: CreateWeddingDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Get('weddings/:id') @Roles(G.EVERYONE.filter((r) => r !== Role.SYSADMIN)) get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Patch('weddings/:id') @Roles(G.PLANNING) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWeddingDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Patch('weddings/:id/status') @Roles(G.PLANNING) status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @CurrentUser() u: AuthUser) { return this.svc.setStatus(id, dto.status, u); }
  @Get('weddings/:id/events') @Roles(G.EVERYONE.filter((r) => r !== Role.SYSADMIN)) events(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.events(id, u); }
  @Post('weddings/:id/events') @Roles(G.PLANNING) addEvent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddEventDto, @CurrentUser() u: AuthUser) { return this.svc.addEvent(id, dto, u); }
  @Get('weddings/:id/activity') activity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.activity(id, 100, u); }

  /** Draft -> confirmed booking. 409 {code:'CONFIRMATION_BLOCKED', blockers} until agreement signed + proposal accepted + deposit verified. Idempotent. */
  @Post('weddings/:id/confirm') @Roles(G.CRM) async confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    await this.scope.assertWeddingAccess(u, id);
    const r = await this.svc.confirm(id, u);
    return { ...r, wedding: await this.svc.get(id, u) };
  }
  /** Readiness checklist for the confirmation guard (staff). */
  @Get('weddings/:id/readiness') @Roles(G.STAFF) async readiness(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { await this.scope.assertWeddingAccess(u, id); return this.svc.readiness(id); }
  @Post('weddings/:id/assign') @Roles(G.CRM) assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto, @CurrentUser() u: AuthUser) { return this.svc.assignStaff(id, dto.userId, u); }

  @Get('couples') couples(@Query('search') s?: string) { return this.svc.couples(s); }
  @Get('couples/:id') couple(@Param('id', ParseUUIDPipe) id: string) { return this.svc.couple(id); }
  @Patch('couples/:id') @Roles(Role.PLANNER) updateCouple(@Param('id', ParseUUIDPipe) id: string, @Body() b: { brideName?: string; groomName?: string; phone?: string; email?: string; address?: string }) { return this.svc.updateCouple(id, b); }
}
