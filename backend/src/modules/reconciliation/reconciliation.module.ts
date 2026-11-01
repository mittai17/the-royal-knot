import { Global, Module } from '@nestjs/common';
import { VendorPaymentsModule } from '../vendor-payments/vendor-payments.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationQueueService } from './reconciliation-queue.service';
import { ReconciliationService } from './reconciliation.service';

@Global() @Module({ imports: [VendorPaymentsModule], controllers: [ReconciliationController], providers: [ReconciliationService, ReconciliationQueueService], exports: [ReconciliationService, ReconciliationQueueService] })
export class ReconciliationModule {}
