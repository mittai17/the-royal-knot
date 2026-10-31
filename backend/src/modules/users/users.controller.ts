import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { PERMISSION_MATRIX } from '../../common/permissions';
import { AddMemberDto, CreateTeamDto, CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users & teams') @ApiCookieAuth() @Controller()
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get('users') list(@Query('role') role?: Role) { return this.svc.list(role); }
  @Get('users/permissions') permissions() { return PERMISSION_MATRIX; }
  @Get('users/workload') workload() { return this.svc.workload(); }
  @Get('users/:id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.svc.detail(id); }
  @Post('users') @Roles(Role.ADMIN) create(@Body() dto: CreateUserDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u.id); }
  @Patch('users/:id') @Roles(Role.ADMIN) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u.id); }

  @Get('teams') teams() { return this.svc.teams(); }
  @Post('teams') @Roles(Role.ADMIN) createTeam(@Body() dto: CreateTeamDto) { return this.svc.createTeam(dto.name); }
  @Post('teams/:id/members') @Roles(Role.ADMIN) add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) { return this.svc.addMember(id, dto.userId); }
  @Delete('teams/:id/members/:userId') @Roles(Role.ADMIN) remove(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.svc.removeMember(id, userId); }
}
