import { Module } from '@nestjs/common';
import { WeddingsModule } from '../weddings/weddings.module';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

@Module({ imports: [WeddingsModule], controllers: [AgreementsController], providers: [AgreementsService], exports: [AgreementsService] })
export class AgreementsModule {}
