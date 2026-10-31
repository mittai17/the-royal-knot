import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { MonitoringService } from './monitoring.service';

@ApiTags('admin: monitoring') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private svc: MonitoringService) {}
  @Get() @RequirePermission('monitoring', 'read') snapshot() { return this.svc.snapshot(); }
}
