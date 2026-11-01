import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AllowExternal, AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G, PERMISSION_MATRIX } from '../../common/permissions';
import { AddMemberDto, CreateTeamDto, CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users & teams') @ApiCookieAuth() @Controller()
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get('users') @Roles(G.STAFF_AND_SYSADMIN) list(@Query('role') role: Role | undefined, @CurrentUser() u: AuthUser) { return this.svc.list(role, u); }
  @Get('users/permissions') @AllowExternal() permissions() { return PERMISSION_MATRIX; }
  @Get('users/workload') @Roles(G.STAFF_AND_SYSADMIN) workload(@CurrentUser() u: AuthUser) { return this.svc.workload(u); }
  @Get('users/:id') @Roles(G.STAFF_AND_SYSADMIN) detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.detail(id, u); }
  @Post('users') @Roles(Role.SYSADMIN) create(@Body() dto: CreateUserDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u.id); }
  @Patch('users/:id') @Roles(Role.SYSADMIN) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u.id); }

  @Get('teams') @Roles(G.STAFF_AND_SYSADMIN) teams() { return this.svc.teams(); }
  @Post('teams') @Roles(Role.FOUNDER) createTeam(@Body() dto: CreateTeamDto) { return this.svc.createTeam(dto.name); }
  @Post('teams/:id/members') @Roles(Role.FOUNDER) add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) { return this.svc.addMember(id, dto.userId); }
  @Delete('teams/:id/members/:userId') @Roles(Role.FOUNDER) remove(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.svc.removeMember(id, userId); }
}
