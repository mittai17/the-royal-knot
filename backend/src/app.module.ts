import { env } from './config/env';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters';
import { JwtAuthGuard, OriginGuard, RolesGuard } from './common/guards';
import { LoggingInterceptor, ResponseInterceptor } from './common/interceptors';
import { DatabaseModule } from './database/prisma.service';
import { HealthController, HealthService, SystemController } from './health/health.controller';
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
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { VendorBillsModule } from './modules/vendor-bills/vendor-bills.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { AccommodationModule } from './modules/accommodation/accommodation.module';
import { TransportModule } from './modules/transport/transport.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { MediaModule } from './modules/media/media.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { AdminModule } from './modules/admin/admin.module';
import { PortalClientModule } from './modules/portal-client/portal-client.module';
import { PortalVendorModule } from './modules/portal-vendor/portal-vendor.module';
import { ScopeModule } from './common/scope.service';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: env.apiRateLimit }]),
    DatabaseModule, AuditModule, WebsocketModule, NotificationsModule, DocumentsModule, ReconciliationModule,
    AuthModule, UsersModule, EnquiriesModule, WeddingsModule, AgreementsModule, VendorsModule, QuotationsModule, TasksModule, EventsModule, GuestsModule, PaymentsModule, ExpensesModule, AnalyticsModule, JobsModule,
    // WedFlow modules (scaffolds; see docs/ROUTES.md)
    ScopeModule, ApprovalsModule, ClientsModule, ProcurementModule, InvoicesModule, VendorBillsModule, BudgetsModule, AccommodationModule, TransportModule, MessagingModule, AnnouncementsModule, FeedbackModule, MediaModule, ChecklistsModule, ProposalsModule, AdminModule, PortalClientModule, PortalVendorModule,
  ],
  controllers: [HealthController, SystemController],
  providers: [
    HealthService,
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
