import { BullModule } from '@nestjs/bullmq';
import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { HealthService } from '../../health/health.controller';
import { AdminConfigController, PublicConfigController } from './config/config.controller';
import { BackupsController, BackupsService } from './backups/backups.controller';
import { EmailController } from './email/email.controller';
import { InsightsController } from './insights/insights.controller';
import { IntegrationsController, IntegrationsService } from './integrations/integrations.controller';
import { MaintenanceController } from './maintenance/maintenance.controller';
import { MasterDataController, MasterDataLookupController } from './master-data/master-data.controller';
import { MonitoringController } from './monitoring/monitoring.controller';
import { MonitoringService } from './monitoring/monitoring.service';
import { LogoController, OrgController } from './org/org.controller';
import { MyPermissionsController, RolesController } from './roles/roles.controller';
import { PermissionsService } from './roles/permissions.service';
import { PermissionGuard } from './shared/permission.guard';
import { RingBufferLogger } from './shared/ring-logger';
import { SettingsService } from './shared/settings.service';
import { AdminStorageService, StorageController } from './storage/storage.controller';
import { FounderSettingsController, TeamController } from './team/team.controller';
import { AdminUsersController } from './users/admin-users.controller';

/**
 * System administration (SYSADMIN, plus FOUNDER who always passes) and Founder settings / team management.
 * Everything here is default-deny for SYSADMIN outside these controllers; financial and wedding data stay off-limits.
 */
@Module({
  imports: [UsersModule, BullModule.registerQueue({ name: 'reminders' }, { name: 'documents' }, { name: 'email' })],
  controllers: [
    InsightsController, AdminUsersController, RolesController, MyPermissionsController, OrgController, LogoController, MasterDataController, MasterDataLookupController,
    AdminConfigController, PublicConfigController, IntegrationsController, EmailController, StorageController, MonitoringController, BackupsController, MaintenanceController,
    TeamController, FounderSettingsController,
  ],
  providers: [HealthService, SettingsService, PermissionsService, PermissionGuard, IntegrationsService, AdminStorageService, MonitoringService, BackupsService],
  exports: [SettingsService, PermissionsService],
})
export class AdminModule implements OnModuleInit {
  onModuleInit() {
    // Keep the console output, additionally capture log lines for Admin > Support & Logs.
    if (process.env.NODE_ENV !== 'test') Logger.overrideLogger(new RingBufferLogger());
  }
}
