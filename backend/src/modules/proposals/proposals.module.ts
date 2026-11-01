import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { WeddingsModule } from '../weddings/weddings.module';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

@Module({ imports: [AgreementsModule, WeddingsModule], controllers: [ProposalsController], providers: [ProposalsService], exports: [ProposalsService] })
export class ProposalsModule {}
