import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { WeddingsController } from './weddings.controller';
import { WeddingsService } from './weddings.service';

/** Exports WeddingsService (confirm / confirmIfReady / refreshBookingStatus) for the payments, agreements and proposals hooks. */
@Module({ imports: [TasksModule], controllers: [WeddingsController], providers: [WeddingsService], exports: [WeddingsService] })
export class WeddingsModule {}
