import { Module } from '@nestjs/common';
import { WeddingsModule } from '../weddings/weddings.module';
import { VendorPaymentsModule } from '../vendor-payments/vendor-payments.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ imports: [WeddingsModule, VendorPaymentsModule], controllers: [PaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
