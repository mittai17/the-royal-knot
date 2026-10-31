import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters';
import { JwtAuthGuard, OriginGuard, RolesGuard } from './common/guards';
import { LoggingInterceptor, ResponseInterceptor } from './common/interceptors';
import { DatabaseModule } from './database/prisma.service';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { AgreementsModule } from './modules/agreements/agreements.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EnquiriesModule } from './modules/enquiries/enquiries.module';
import { EventsModule } from './modules/events/events.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { GuestsModule } from './modules/guests/guests.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { WeddingsModule } from './modules/weddings/weddings.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }]),
    DatabaseModule, AuditModule, WebsocketModule, NotificationsModule, DocumentsModule, ReconciliationModule,
    AuthModule, UsersModule, EnquiriesModule, WeddingsModule, AgreementsModule, VendorsModule, QuotationsModule, TasksModule, EventsModule, GuestsModule, PaymentsModule, ExpensesModule, AnalyticsModule, JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
