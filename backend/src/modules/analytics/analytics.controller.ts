import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics') @ApiCookieAuth() @Controller()
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}
  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser) { return this.svc.dashboard(u); }
  @Get('search') search(@Query('q') q: string, @CurrentUser() u: AuthUser) { return this.svc.search(q ?? '', u.role); }
  @Get('analytics/overview') @Roles(G.ANALYTICS) overview() { return this.svc.overview(); }
  @Get('analytics/profitability') @Roles(G.ANALYTICS) profitability(@Query('sort') sort?: string, @Query('order') order?: 'asc' | 'desc') { return this.svc.profitability(sort, order); }
  @Get('analytics/profitability/:weddingId') @Roles(G.FINANCE_READ) one(@Param('weddingId', ParseUUIDPipe) id: string) { return this.svc.weddingFinancial(id); }
  @Get('analytics/vendors') @Roles(G.ANALYTICS) vendors() { return this.svc.vendors(); }
  @Get('analytics/team') @Roles(G.ANALYTICS) team() { return this.svc.team(); }
}
