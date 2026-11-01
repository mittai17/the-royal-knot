import { Module } from '@nestjs/common';
import { VendorPaymentsController } from './vendor-payments.controller';
import { VendorPaymentsService } from './vendor-payments.service';

@Module({ controllers: [VendorPaymentsController], providers: [VendorPaymentsService], exports: [VendorPaymentsService] })
export class VendorPaymentsModule {}
