import { Module } from '@nestjs/common';
import { PortalSettings } from '../../common/portal-settings';
import { EventsModule } from '../events/events.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { TasksModule } from '../tasks/tasks.module';
import { PortalVendorController } from './portal-vendor.controller';
import { PortalVendorService } from './portal-vendor.service';

/** Vendor portal (`/portal/vendor/*`). Reuses quotations, events (arrivals) and tasks services; every query is scoped to User.vendorId. */
@Module({ imports: [QuotationsModule, EventsModule, TasksModule], controllers: [PortalVendorController], providers: [PortalVendorService, PortalSettings] })
export class PortalVendorModule {}
