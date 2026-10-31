import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { ClientQuery, CreateClientDto, UpdateClientDto } from './clients.dto';
import { ClientsService } from './clients.service';

/** Client directory over Couple. Read: founder, planner, finance. Write: planner (and founder). */
@ApiTags('clients') @ApiCookieAuth() @Controller('clients') @Roles(Role.PLANNER, Role.FINANCE)
export class ClientsController {
  constructor(private svc: ClientsService) {}
  @Get() list(@Query() q: ClientQuery) { return this.svc.list(q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post() @Roles(Role.PLANNER) create(@CurrentUser() u: AuthUser, @Body() dto: CreateClientDto) { return this.svc.create(u, dto); }
  @Patch(':id') @Roles(Role.PLANNER) update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) { return this.svc.update(u, id, dto); }
}
