import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { WeddingsModule } from '../weddings/weddings.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Global() @Module({ imports: [UsersModule, WeddingsModule], controllers: [AnalyticsController], providers: [AnalyticsService], exports: [AnalyticsService] })
export class AnalyticsModule {}
