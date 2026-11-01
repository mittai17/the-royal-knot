import { Module } from '@nestjs/common';
import { VendorPaymentsModule } from '../vendor-payments/vendor-payments.module';
import { VendorBillsController } from './vendor-bills.controller';
import { VendorBillsService } from './vendor-bills.service';
import { VendorInvoicesController } from './vendor-invoices.controller';

@Module({ imports: [VendorPaymentsModule], controllers: [VendorBillsController, VendorInvoicesController], providers: [VendorBillsService], exports: [VendorBillsService] })
export class VendorBillsModule {}
