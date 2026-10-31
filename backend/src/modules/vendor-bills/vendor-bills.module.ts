import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { VendorBillsController } from './vendor-bills.controller';
import { VendorBillsService } from './vendor-bills.service';
import { VendorInvoicesController } from './vendor-invoices.controller';

@Module({ imports: [PaymentsModule], controllers: [VendorBillsController, VendorInvoicesController], providers: [VendorBillsService], exports: [VendorBillsService] })
export class VendorBillsModule {}
