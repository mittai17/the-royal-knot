import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PortalSettings } from '../../common/portal-settings';
import { AgreementsModule } from '../agreements/agreements.module';
import { GuestsModule } from '../guests/guests.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { PaymentsModule } from '../payments/payments.module';
import { WeddingsModule } from '../weddings/weddings.module';
import { PortalClientController } from './portal-client.controller';
import { PortalClientService } from './portal-client.service';

/** Couple / client portal (`/portal/client/*`). Reuses the guests, payments, agreements, documents and weddings services; every query is scoped to the couple's own wedding. */
@Module({
  imports: [BullModule.registerQueue({ name: 'email' }), GuestsModule, PaymentsModule, AgreementsModule, WeddingsModule, QuotationsModule],
  controllers: [PortalClientController], providers: [PortalClientService, PortalSettings],
})
export class PortalClientModule {}
