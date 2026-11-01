import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { BudgetsService } from './budgets.service';
import { CashFlowQuery, CreateBudgetDto, ReportQuery, ScopeQuery, UpdateBudgetDto } from './budgets.dto';
import { toCsv } from './csv';
import { FinancialReportsService, REPORTS, ReportName } from './financial-reports.service';
import { NotFoundException } from '@nestjs/common';

@ApiTags('budgets') @ApiCookieAuth() @Controller('budgets') @Roles(Role.FINANCE, Role.PLANNER)
export class BudgetsController {
  constructor(private svc: BudgetsService) {}
  @Get('overview') overview(@Query() q: ScopeQuery) { return this.svc.overview(q.weddingId); }
  @Get('cash-flow') cashFlow(@Query() q: CashFlowQuery) { return this.svc.cashFlow(q.weddingId, q.back ?? 6, q.ahead ?? 6); }
  @Get('wedding/:weddingId') forWedding(@Param('weddingId', ParseUUIDPipe) id: string) { return this.svc.listForWedding(id); }
  @Post() @Roles(G.FINANCE_WRITE) create(@Body() dto: CreateBudgetDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Patch(':id') @Roles(G.FINANCE_WRITE) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBudgetDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
}

@ApiTags('analytics') @ApiCookieAuth() @Controller('analytics/financial') @Roles(G.ANALYTICS)
export class FinancialReportsController {
  constructor(private svc: FinancialReportsService) {}
  @Get(':report')
  async report(@Param('report') report: string, @Query() q: ReportQuery) {
    if (!(REPORTS as readonly string[]).includes(report)) throw new NotFoundException(`Unknown report "${report}". Available: ${REPORTS.join(', ')}`);
    const data = await this.svc.run(report as ReportName, this.svc.parseRange(q.from, q.to));
    if (q.format !== 'csv') return data;
    const rows = this.svc.csvRows(data);
    return new StreamableFile(Buffer.from(toCsv(rows), 'utf8'), { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="${report}-${new Date().toISOString().slice(0, 10)}.csv"` });
  }
}
