import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateExpenseDto, DecideExpenseDto, ExpenseQuery, VoidExpenseDto, SetBudgetDto, UpdateExpenseDto } from './expenses.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses') @ApiCookieAuth() @Controller() @Roles(G.FINANCE_READ)
export class ExpensesController {
  constructor(private svc: ExpensesService) {}
  @Get('expenses') list(@Query() q: ExpenseQuery) { return this.svc.list(q); }
  @Post('expenses') @Roles(G.ALL) create(@Body() dto: CreateExpenseDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Patch('expenses/:id') @Roles(G.ALL) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Post('expenses/:id/decision') @Roles(Role.FINANCE) decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideExpenseDto, @CurrentUser() u: AuthUser) { return this.svc.decide(id, dto, u); }
  /** Never a delete: pending -> rejected, approved -> reversal entry. */
  @Post('expenses/:id/void') @Roles(Role.FINANCE) void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidExpenseDto, @CurrentUser() u: AuthUser) { return this.svc.void(id, dto.reason, u); }
  @Get('weddings/:id/expense-summary') summary(@Param('id', ParseUUIDPipe) id: string) { return this.svc.summary(id); }
  @Put('weddings/:id/budget') @Roles(Role.FINANCE, Role.PLANNER) budget(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetBudgetDto, @CurrentUser() u: AuthUser) { return this.svc.setBudget(id, dto, u); }
}
