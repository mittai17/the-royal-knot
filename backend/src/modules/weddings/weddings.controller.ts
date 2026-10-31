import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { EventKind, Role, WeddingStatus } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
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

@ApiTags('weddings') @ApiCookieAuth() @Controller()
export class WeddingsController {
  constructor(private svc: WeddingsService) {}

  @Get('weddings') @Roles(G.EVERYONE.filter((r) => r !== Role.SYSADMIN)) list(@Query() q: WeddingQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Post('weddings') @Roles(G.CRM) create(@Body() dto: CreateWeddingDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Get('weddings/:id') @Roles(G.EVERYONE.filter((r) => r !== Role.SYSADMIN)) get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Patch('weddings/:id') @Roles(G.PLANNING) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWeddingDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Patch('weddings/:id/status') @Roles(G.PLANNING) status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @CurrentUser() u: AuthUser) { return this.svc.setStatus(id, dto.status, u); }
  @Get('weddings/:id/events') @Roles(G.EVERYONE.filter((r) => r !== Role.SYSADMIN)) events(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.events(id, u); }
  @Post('weddings/:id/events') @Roles(G.PLANNING) addEvent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddEventDto) { return this.svc.addEvent(id, dto); }
  @Get('weddings/:id/activity') activity(@Param('id', ParseUUIDPipe) id: string) { return this.svc.activity(id); }

  @Get('couples') couples(@Query('search') s?: string) { return this.svc.couples(s); }
  @Get('couples/:id') couple(@Param('id', ParseUUIDPipe) id: string) { return this.svc.couple(id); }
  @Patch('couples/:id') @Roles(Role.PLANNER) updateCouple(@Param('id', ParseUUIDPipe) id: string, @Body() b: { brideName?: string; groomName?: string; phone?: string; email?: string; address?: string }) { return this.svc.updateCouple(id, b); }
}
